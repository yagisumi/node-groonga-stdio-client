import child_process from 'child_process'
import fs from 'fs'
import { GroongaCommand, parseCommand, TypeGuards } from '@yagisumi/groonga-command'
import { formatCommand, getResponseBody } from './client_utils'
export { GroongaError } from './client_utils'

export type Options = {
  groongaPath?: string
  openOnly?: boolean
  readInterval?: number
}

type CommandCallback = (err: Error | undefined, data: any) => void

type CommandData = {
  command: GroongaCommand
  callback: CommandCallback
  error?: Error
}

function isErrnoException(err: any): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err instanceof Error && 'code' in err
}

export class GroongaStdioClient {
  readonly dbPath: string
  private readInterval = 300
  timeout = 10000
  private groongaPath = 'groonga'
  private openOnly = false
  private groonga?: child_process.ChildProcessWithoutNullStreams
  private executing = false
  private commandQueue: CommandData[] = []
  private currentCommandData?: CommandData
  private data?: string
  private buf?: Buffer
  private currentOutputType?: string
  private intervalId?: NodeJS.Timeout
  private timeoutId?: NodeJS.Timeout
  private _error?: Error
  get error() {
    return this._error
  }

  constructor(db_path: string, options?: Options) {
    this.dbPath = db_path
    if (options) {
      if (options.groongaPath != null) {
        this.groongaPath = options.groongaPath
      }
      if (options.readInterval != null) {
        this.readInterval = Math.max(options.readInterval, 300)
      }
      if (options.openOnly != null) {
        this.openOnly = options.openOnly
      }
    }
    this.initGroonga()
  }

  private initGroonga() {
    if (this.groonga) {
      return
    }

    const args: string[] = []
    if (!fs.existsSync(this.dbPath) && !this.openOnly) {
      args.push('-n')
    }
    args.push(this.dbPath)

    this.groonga = child_process.spawn(this.groongaPath, args, { stdio: 'pipe' })

    this.groonga.on('exit', (code) => {
      if (code !== 0 && this.groonga) {
        try {
          this.groonga.stderr.setEncoding('utf8')
          const message = this.groonga.stderr.read()
          if (typeof message === 'string' && message.length > 0) {
            this._error = new Error(`[exit code: ${code}] ${message}`)
          } else {
            this._error = new Error(`[exit code: ${code}]`)
          }
        } catch (err) {
          this._error = new Error(`[exit code: ${code}]`)
        }
      }
      this.resetGroonga()
    })

    this.groonga.on('error', (err) => {
      if (isErrnoException(err)) {
        const code = err.code ?? ''
        if (code === 'ENOENT') {
          this._error = err
          this.resetGroonga()
          return
        }
      }
    })
  }

  private resetGroonga() {
    if (this.groonga) {
      this.groonga.removeAllListeners('error')
      this.groonga.removeAllListeners('exit')
    }
    this.groonga = undefined
  }

  isAlive() {
    return this.groonga !== undefined
  }

  command(command: string, options: Record<string, unknown>, callback: CommandCallback): void
  command(command: string, callback: CommandCallback): void
  command(command: string, opts_or_cb: Record<string, unknown> | CommandCallback, callback?: CommandCallback): void {
    let opts: Record<string, unknown>
    let cb: CommandCallback
    if (typeof opts_or_cb === 'object') {
      if (callback) {
        opts = opts_or_cb
        cb = callback
      } else {
        throw new Error('unexpected error')
      }
    } else {
      cb = opts_or_cb
      opts = {}
    }

    const cmd = parseCommand(command, opts as { [name: string]: string | number })
    if (cmd === undefined) {
      cb(new Error('command parse error'), null)
      return
    }

    this.commandQueue.push({ command: cmd, callback: cb })
    setImmediate(() => {
      this.execute()
    })
  }

  private execute() {
    if (this.executing) {
      return
    }

    const command_data = this.commandQueue.shift()
    if (command_data === undefined) {
      return
    }

    if (this.groonga === undefined) {
      command_data.callback(new Error('groonga already ended'), null)
      return
    }

    if (this.currentCommandData) {
      this.currentCommandData.callback(new Error('something error occured'), null)
    }
    this.currentCommandData = command_data

    this.executing = true
    this.initResponse()
    this.groonga.stdin.write(formatCommand(this.currentCommandData.command))
  }

  private initResponse() {
    this.data = undefined

    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }

    this.currentOutputType = this.currentCommandData?.command.output_type ?? 'json'

    this.timeoutId = setTimeout(() => {
      this.timeoutId = undefined
      if (this.currentCommandData) {
        this.currentCommandData.error = new Error('timeout error')
      }
      this.done()
    }, Math.max(this.timeout, 30000))

    this.intervalId = setInterval(() => {
      if (this.groonga === undefined) {
        this.done()
        return
      }

      const data = this.groonga.stdout.read()
      if (Buffer.isBuffer(data)) {
        if (this.buf) {
          this.buf = Buffer.concat([this.buf, data])
        } else {
          this.buf = data
        }
        this.data = (this.data ?? '') + data.toString('utf8')
      } else if (typeof data === 'string') {
        this.data = (this.data ?? '') + data
      } else if (data == null) {
        if (this.buf || this.data != null) {
          this.done()
        }
      }
    }, this.readInterval)
  }

  private done() {
    this.executing = false

    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = undefined
    }

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }

    if (this.currentCommandData) {
      if (this.currentOutputType === 'msgpack' && this.buf) {
        this.currentCommandData.callback(undefined, this.buf)
      } else if (this.data != null) {
        if (TypeGuards.isDump(this.currentCommandData.command)) {
          this.currentCommandData.callback(undefined, this.data)
        } else {
          try {
            const res = JSON.parse(this.data)
            const { error, value } = getResponseBody(res)
            this.currentCommandData.callback(error, value)
          } catch (err) {
            this.currentCommandData.callback(undefined, this.data)
          }
        }
      } else {
        if (this.currentCommandData.error) {
          this.currentCommandData.callback(this.currentCommandData.error, null)
        } else if (this.groonga === undefined) {
          this.currentCommandData.callback(new Error('groonga already ended'), null)
        } else {
          this.currentCommandData.callback(new Error('empty data error'), null)
        }
      }
    }

    this.data = undefined
    this.buf = undefined
    this.currentCommandData = undefined

    if (this.commandQueue.length > 0) {
      setImmediate(() => {
        this.execute()
      })
    }
  }

  commandAsync(command: string, options: Record<string, unknown>): Promise<any>
  commandAsync(command: string): Promise<any>
  commandAsync(command: string, options?: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.command(command, options || {}, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }

  kill() {
    if (this.groonga) {
      try {
        const r = this.groonga.kill()
        this.resetGroonga()
        return r
      } catch (err) {
        return false
      }
    } else {
      return false
    }
  }
}

export function createGroongaClient(db_path: string, options?: Options) {
  return new GroongaStdioClient(db_path, options)
}

export const createClient = createGroongaClient

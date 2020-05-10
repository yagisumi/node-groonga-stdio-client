import child_process from 'child_process'
import fs from 'fs'
import { GroongaCommand, parseCommand, TypeGuards } from '@yagisumi/groonga-command'
import { formatCommand, getResponseBody } from './client_utils'
export { GroongaError } from './client_utils'

export type Options = {
  groongaPath?: string
  readInterval?: number
}

type CommandCallback = (err: Error | undefined, data: any) => void

type CommandData = {
  command: GroongaCommand
  callback: CommandCallback
}

function isErrnoException(err: any): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err instanceof Error && ('errno' in err || 'code' in err)
}

export class GroongaStdioClient {
  readonly dbPath: string
  private readInterval = 300
  timeout = 10000
  private groongaPath = 'groonga'
  private groonga?: child_process.ChildProcessWithoutNullStreams
  private executing = false
  private commandQueue: CommandData[] = []
  private currentCommandData?: CommandData
  private data?: string
  private buf?: Buffer
  private currentOutputType?: string
  private intervalId?: NodeJS.Timeout
  private timeoutId?: NodeJS.Timeout
  private error?: Error

  constructor(db_path: string, options?: Options) {
    this.dbPath = db_path
    if (options) {
      if (options.groongaPath) {
        this.groongaPath = options.groongaPath
      }
      if (options.readInterval) {
        this.readInterval = Math.max(options.readInterval, 300)
      }
    }
    this.initGroonga()
  }

  private initGroonga() {
    if (this.groonga) {
      return
    }

    const args: string[] = []
    if (!fs.existsSync(this.dbPath)) {
      args.push('-n')
    }
    args.push(this.dbPath)

    this.groonga = child_process.spawn(this.groongaPath, args, { stdio: 'pipe' })

    this.groonga.on('exit', () => {
      this.resetGroonga()
    })

    this.groonga.on('error', (err) => {
      if (isErrnoException(err)) {
        const code = err.code ?? ''
        if (code === 'ENOENT') {
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

  command(command: string, options: object, callback: CommandCallback): void
  command(command: string, callback: CommandCallback): void
  command(command: string, opts_or_cb: object | CommandCallback, callback?: CommandCallback): void {
    let opts: object
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
    this.error = undefined

    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }

    this.currentOutputType = this.currentCommandData?.command.output_type ?? 'json'

    this.timeoutId = setTimeout(() => {
      this.timeoutId = undefined
      this.error = new Error('timeout error')
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
        if (this.buf || this.data) {
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

    if (this.currentCommandData !== undefined) {
      if (this.currentOutputType === 'msgpack' && this.buf) {
        this.currentCommandData.callback(undefined, this.buf)
      } else if (this.data) {
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
        if (this.error) {
          this.currentCommandData.callback(this.error, null)
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

  commandAsync(command: string, options: object): Promise<any>
  commandAsync(command: string): Promise<any>
  commandAsync(command: string, options?: object): Promise<any> {
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

export function createClient(db_path: string, options?: Options) {
  return new GroongaStdioClient(db_path, options)
}

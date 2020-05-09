import fs from 'fs'
import path from 'path'
import { Options, GroongaStdioClient } from '@/groonga-stdio-client'

export function mkdir(path: string) {
  fs.mkdirSync(path)
}

export function rimraf(dir_path: string) {
  if (fs.existsSync(dir_path)) {
    fs.readdirSync(dir_path).forEach(function (entry) {
      const entry_path = path.join(dir_path, entry)
      if (fs.lstatSync(entry_path).isDirectory()) {
        rimraf(entry_path)
      } else {
        fs.unlinkSync(entry_path)
      }
    })
    fs.rmdirSync(dir_path)
  }
}

export function createOptions() {
  const opts: Options = {}
  if (process.platform === 'win32') {
    const env_path = process.env.GROONGA_PATH
    if (env_path == null) {
      throw new Error("missing environment variable 'GROONGA_PATH'")
    }
    opts['groongaPath'] = path.join(env_path, 'bin/groonga.exe')
  }

  return opts
}

export function shutdown(client: GroongaStdioClient): Promise<void>
export function shutdown(client: GroongaStdioClient, done: jest.DoneCallback): void
export function shutdown(client: GroongaStdioClient, done?: jest.DoneCallback): Promise<void> | void {
  if (done) {
    client.command('quit', () => {
      client.kill()
      done()
    })
  } else {
    return new Promise((resolve) => {
      client.command('quit', () => {
        client.kill()
        resolve()
      })
    })
  }
}

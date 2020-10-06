import { createClient, GroongaStdioClient, GroongaError } from '@/groonga-stdio-client'
import { mkdir, rimraf, createOptions, shutdown } from './test_utils'
import path from 'path'

describe('GroongaStdioClient', () => {
  let db_dir: string | undefined
  let client: GroongaStdioClient | undefined

  beforeEach(() => {
    db_dir = undefined
    client = undefined
  })

  afterEach(async () => {
    if (client) {
      await shutdown(client).catch(() => null)
    }
    if (db_dir != null) {
      rimraf(db_dir)
    }
  })

  test('invalid groonga path', (done) => {
    db_dir = path.join(__dirname, 'temp.invalid_groonga')
    const db_path = path.join(db_dir, `db`)
    rimraf(db_dir)
    mkdir(db_dir)

    client = new GroongaStdioClient(db_path, { groongaPath: '!!!groonga!!!', readInterval: 1000 })
    setTimeout(() => {
      if (client) {
        expect(client['groonga']).toBeUndefined()
        expect(client.error).toBeInstanceOf(Error)
        client.command('status', (err, data) => {
          if (client) {
            expect(err).toBeInstanceOf(Error)
            expect(data).toBeNull()
            expect(client.isAlive()).toBe(false)
            done()
          }
        })
      }
    }, 1000)
  })

  test('openOnly', (done) => {
    db_dir = path.join(__dirname, 'temp.openonlry')
    const db_path = path.join(db_dir, `db`)
    rimraf(db_dir)
    mkdir(db_dir)

    const opts = createOptions()
    opts.openOnly = true
    client = createClient(db_path, opts)
    expect(client.error).toBeUndefined()

    setTimeout(() => {
      try {
        expect(client?.error).toBeInstanceOf(Error)
        done()
      } catch (e) {
        //
      }
    }, 1000)
  })

  test('kill client', (done) => {
    db_dir = path.join(__dirname, 'temp.kill_client')
    const db_path = path.join(db_dir, `db`)
    rimraf(db_dir)
    mkdir(db_dir)

    const opts = createOptions()
    client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    setTimeout(() => {
      if (client) {
        expect(client.kill()).toBe(true)
      }
      done()
    }, 1000)
  })

  test('invalid command', (done) => {
    db_dir = path.join(__dirname, 'temp.invalid_command')
    const db_path = path.join(db_dir, `db`)
    rimraf(db_dir)
    mkdir(db_dir)

    const opts = createOptions()
    client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    client.command('', (err, data) => {
      expect(err).toBeInstanceOf(Error)
      expect(data).toBeNull()
      done()
    })
  })

  test('command success', (done) => {
    db_dir = path.join(__dirname, 'temp.command_success')
    const db_path = path.join(db_dir, `db`)
    rimraf(db_dir)
    mkdir(db_dir)

    const opts = createOptions()
    client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    client.command('status', (err, data) => {
      expect(err).toBeUndefined()
      expect(typeof data).toBe('object')
      done()
    })
  })

  test('command failure', (done) => {
    db_dir = path.join(__dirname, 'temp.command_fail')
    const db_path = path.join(db_dir, `db`)
    rimraf(db_dir)
    mkdir(db_dir)

    const opts = createOptions()
    client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    client.command('table_create', (err, data) => {
      expect(err).toBeInstanceOf(GroongaError)
      expect(data).toBeNull()
      done()
    })
  })

  test('message pack (unsupported)', (done) => {
    db_dir = path.join(__dirname, 'temp.message_pack')
    const db_path = path.join(db_dir, `db`)
    rimraf(db_dir)
    mkdir(db_dir)

    const opts = createOptions()
    client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    client.command('status --output_type msgpack', (err, data) => {
      expect(err).toBeUndefined()
      expect(Buffer.isBuffer(data)).toBe(true)
      done()
    })
  })

  test('commandAsync', async () => {
    db_dir = path.join(__dirname, 'temp.commandAsync')
    const db_path = path.join(db_dir, `db`)
    rimraf(db_dir)
    mkdir(db_dir)

    const opts = createOptions()
    client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    const r1 = await client
      .commandAsync('table_create People TABLE_HASH_KEY', { key_type: 'ShortText' })
      .catch(() => undefined)
    expect(r1).not.toBeUndefined()
    expect(r1).toBe(true)

    const r2 = await client.commandAsync('dump').catch(() => undefined)
    expect(r2).not.toBeUndefined()
    expect((r2 as string).trim()).toBe('table_create People TABLE_HASH_KEY ShortText')

    const r3 = await client
      .commandAsync('column_create --table People --name age --flags COLUMN_SCALAR --type UInt8')
      .catch(() => undefined)
    expect(r3).not.toBeUndefined()
    expect(r3).toBe(true)

    const r4 = await client
      .commandAsync('load --table People', { values: JSON.stringify([{ _key: 'alice', age: 7 }]) })
      .catch(() => undefined)
    expect(r4).not.toBeUndefined()
    expect(r4).toBe(1)

    const r5 = await client.commandAsync('table_create').catch((err) => err)
    expect(r5).toBeInstanceOf(GroongaError)
  })
})

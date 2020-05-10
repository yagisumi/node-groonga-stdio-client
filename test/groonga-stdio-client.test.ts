import { createClient, GroongaStdioClient, GroongaError } from '@/groonga-stdio-client'
import { mkdir, rimraf, createOptions, shutdown } from './test_utils'
import path from 'path'

describe('GroongaStdioClient', () => {
  const db_dir = path.join(__dirname, 'db_main')

  beforeAll(() => {
    rimraf(db_dir)
    mkdir(db_dir)
  })

  afterAll(() => {
    return new Promise((resolve) => {
      setTimeout(() => {
        rimraf(db_dir)
        resolve()
      }, 800)
    })
  })

  test('invalid groonga path', (done) => {
    const db_path = path.join(db_dir, `invalid_groonga.db`)
    const client = new GroongaStdioClient(db_path, { groongaPath: '!!!groonga!!!', readInterval: 1000 })
    setTimeout(() => {
      console.log('timeout')
      expect(client['groonga']).toBeUndefined()
      expect(client.error).toBeInstanceOf(Error)
      client.command('status', (err, data) => {
        expect(err).toBeInstanceOf(Error)
        expect(data).toBeNull()
        expect(client.isAlive()).toBe(false)
        client.kill()
        done()
      })
    }, 1000)
  })

  test('kill client', (done) => {
    const db_path = path.join(db_dir, `kill_client.db`)
    const opts = createOptions()
    const client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    if (client) {
      setTimeout(() => {
        expect(client.kill()).toBe(true)
        shutdown(client, done)
      }, 1000)
    } else {
      done()
    }
  })

  test('invalid command', (done) => {
    const db_path = path.join(db_dir, `invalid_command.db`)
    const opts = createOptions()
    const client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    if (client) {
      client.command('', (err, data) => {
        try {
          expect(err).toBeInstanceOf(Error)
          expect(data).toBeNull()
        } finally {
          shutdown(client, done)
        }
      })
    } else {
      done()
    }
  })

  test('command success', (done) => {
    const db_path = path.join(db_dir, 'command_success.db')
    const opts = createOptions()
    const client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    if (client) {
      client.command('status', (err, data) => {
        try {
          expect(err).toBeUndefined()
          expect(typeof data).toBe('object')
        } finally {
          shutdown(client, done)
        }
      })
    } else {
      done()
    }
  })

  test('command failure', (done) => {
    const db_path = path.join(db_dir, 'command_fail.db')
    const opts = createOptions()
    const client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    if (client) {
      client.command('table_create', (err, data) => {
        try {
          expect(err).toBeInstanceOf(GroongaError)
          expect(data).toBeNull()
        } finally {
          shutdown(client, done)
        }
      })
    } else {
      done()
    }
  })

  test('message pack (unsupported)', (done) => {
    const db_path = path.join(db_dir, 'message_pack.db')
    const opts = createOptions()
    const client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    if (client) {
      client.command('status --output_type msgpack', (err, data) => {
        try {
          expect(err).toBeUndefined()
          expect(Buffer.isBuffer(data)).toBe(true)
        } finally {
          shutdown(client, done)
        }
      })
    } else {
      done()
    }
  })

  test('commandAsync', async () => {
    const db_path = path.join(db_dir, 'commandAsync.db')
    const opts = createOptions()
    const client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    if (client) {
      try {
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
      } finally {
        await shutdown(client)
      }
    }
  })
})

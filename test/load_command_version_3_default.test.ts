import { createClient } from '@/groonga-stdio-client'
import { mkdir, rimraf, createOptions, shutdown } from './test_utils'
import path from 'path'

describe('GroongaStdioClient', () => {
  const db_dir = path.join(__dirname, 'db_load')

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

  test('load/command_version/3/default', async () => {
    const db_path = path.join(db_dir, `load.db`)
    const opts = createOptions()
    const client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    if (client === undefined) {
      return
    }

    try {
      const r1 = await client.commandAsync('table_create Memos TABLE_NO_KEY')
      expect(r1).toBe(true)

      const r2 = await client.commandAsync('column_create Memos value COLUMN_SCALAR Int8')
      expect(r2).toBe(true)

      const r3 = await client.commandAsync('load --table Memos --command_version 3', {
        values: JSON.stringify([{ value: 1 }, { value: 2 }]),
      })
      expect(r3).toEqual({
        n_loaded_records: 2,
      })
    } finally {
      await shutdown(client)
    }
  })
})

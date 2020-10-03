import { createClient, GroongaStdioClient } from '@/groonga-stdio-client'
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
    if (db_dir) {
      rimraf(db_dir)
    }
  })

  test('load/command_version/3/default', async () => {
    db_dir = path.join(__dirname, 'temp.load_command_version_3')
    const db_path = path.join(db_dir, `db`)
    rimraf(db_dir)
    mkdir(db_dir)

    const opts = createOptions()
    client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    if (client === undefined) {
      return
    }

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
  })
})

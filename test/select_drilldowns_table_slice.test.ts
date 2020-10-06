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
      await shutdown(client)
    }
    if (db_dir != null) {
      rimraf(db_dir)
    }
  })

  test('select/drilldowns/table/slice', async () => {
    db_dir = path.join(__dirname, 'temp.select_drilldowns_table_slice')
    const db_path = path.join(db_dir, `db`)
    rimraf(db_dir)
    mkdir(db_dir)

    const opts = createOptions()
    client = createClient(db_path, opts)

    expect(client).not.toBeUndefined()

    if (client === undefined) {
      return
    }

    const r1 = await client.commandAsync('table_create Tags TABLE_PAT_KEY ShortText')
    expect(r1).toBe(true)

    const r2 = await client.commandAsync('table_create Memos TABLE_HASH_KEY ShortText')
    expect(r2).toBe(true)

    const r3 = await client.commandAsync('column_create Memos date COLUMN_SCALAR Time')
    expect(r3).toBe(true)

    const r4 = await client.commandAsync('column_create Memos tag COLUMN_SCALAR Tags')
    expect(r4).toBe(true)

    const r5 = await client.commandAsync('column_create Tags memos_tag COLUMN_INDEX Memos tag')
    expect(r5).toBe(true)

    const r6 = await client.commandAsync('load --table Memos', {
      values: JSON.stringify([
        { _key: 'Groonga is fast!', date: '2016-05-19 12:00:00', tag: 'Groonga' },
        { _key: 'Mroonga is fast!', date: '2016-05-19 12:00:01', tag: 'Mroonga' },
        { _key: 'Groonga sticker!', date: '2016-05-19 12:00:02', tag: 'Groonga' },
        { _key: 'Groonga site!', date: '2016-05-19 12:00:02', tag: 'Groonga' },
        { _key: 'Rroonga is fast!', date: '2016-05-19 12:00:03', tag: 'Rroonga' },
      ]),
    })
    expect(r6).toBe(5)

    const r7 = await client.commandAsync(`select Memos \\
        --filter 'date < "2016-05-19 13:00:02"' \\
        --slices[groonga].filter 'tag @ "Groonga"' \\
        --slices[groonga].sort_keys '_id' \\
        --slices[groonga].output_columns '_key, date, tag' \\
        --drilldowns[tags].table groonga \\
        --drilldowns[tags].keys date`)

    const tz_offset = new Date().getTimezoneOffset() * 60
    expect(r7).toEqual([
      [
        [5],
        [
          ['_id', 'UInt32'],
          ['_key', 'ShortText'],
          ['date', 'Time'],
          ['tag', 'Tags'],
        ],
        [1, 'Groonga is fast!', 1463626800.0 + 32400 + tz_offset, 'Groonga'],
        [2, 'Mroonga is fast!', 1463626801.0 + 32400 + tz_offset, 'Mroonga'],
        [3, 'Groonga sticker!', 1463626802.0 + 32400 + tz_offset, 'Groonga'],
        [4, 'Groonga site!', 1463626802.0 + 32400 + tz_offset, 'Groonga'],
        [5, 'Rroonga is fast!', 1463626803.0 + 32400 + tz_offset, 'Rroonga'],
      ],
      {
        groonga: [
          [3],
          [
            ['_key', 'ShortText'],
            ['date', 'Time'],
            ['tag', 'Tags'],
          ],
          ['Groonga is fast!', 1463626800.0 + 32400 + tz_offset, 'Groonga'],
          ['Groonga sticker!', 1463626802.0 + 32400 + tz_offset, 'Groonga'],
          ['Groonga site!', 1463626802.0 + 32400 + tz_offset, 'Groonga'],
        ],
      },
      {
        tags: [
          [2],
          [
            ['_key', 'Time'],
            ['_nsubrecs', 'Int32'],
          ],
          [1463626800.0 + 32400 + tz_offset, 1],
          [1463626802.0 + 32400 + tz_offset, 2],
        ],
      },
    ])
  })
})

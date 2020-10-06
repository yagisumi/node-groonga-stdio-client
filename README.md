# @yagisumi/groonga-stdio-client

**For testing purposes.**<br/>
Groonga Standard I/O interface client.

[![NPM version][npm-image]][npm-url] [![install size][packagephobia-image]][packagephobia-url] [![DefinitelyTyped][dts-image]][dts-url]  
[![Build Status][githubactions-image]][githubactions-url] [![Coverage percentage][coveralls-image]][coveralls-url]

## Usage

```ts
import { createGroongaClient } from '@yagisumi/groonga-stdio-client'

async function main() {
  const client = createGroongaClient(dbPath, { groongaPath: 'groonga' })
  const r1 = await client.commandAsync('status').catch(() => undefined)

  client.command('table_list', (err, data) => {
    if (err) {
      console.error(err)
    } else {
      console.log(data)
    }
  })
}
main()
```

## API

### `createGroongaClient`
alias: `createClient`
```ts
function createClient(
  db_path: string, 
  options?: { groongaPath?: string; readInterval?: number }
): GroongaStdioClient
```
Creats a client. Same as `new GroongaStdioClient(db_path, options)`

### `GroongaStdioClient`
#### `command`
```ts
command(
  command: string,
  options: object,
  callback: (err: Error, data: any) => void
): void
command(
  command: string,
  callback: (err: Error, data: any) => void
): void
```
Executes a command with a callback.

#### `commandAsync`
```ts
commandAsync(
  command: string,
  options: object
): Promise<any>
commandAsync(
  command: string
): Promise<any>
```
Executes a command and returns a promise.

## License

[MIT License](https://opensource.org/licenses/MIT)

[githubactions-image]: https://img.shields.io/github/workflow/status/yagisumi/node-groonga-stdio-client/build?logo=github&style=flat-square
[githubactions-url]: https://github.com/yagisumi/node-groonga-stdio-client/actions
[npm-image]: https://img.shields.io/npm/v/@yagisumi/groonga-stdio-client.svg?style=flat-square
[npm-url]: https://npmjs.org/package/@yagisumi/groonga-stdio-client
[packagephobia-image]: https://flat.badgen.net/packagephobia/install/@yagisumi/groonga-stdio-client
[packagephobia-url]: https://packagephobia.now.sh/result?p=@yagisumi/groonga-stdio-client
[coveralls-image]: https://img.shields.io/coveralls/yagisumi/node-groonga-stdio-client.svg?style=flat-square
[coveralls-url]: https://coveralls.io/github/yagisumi/node-groonga-stdio-client?branch=master
[dts-image]: https://img.shields.io/badge/DefinitelyTyped-.d.ts-blue.svg?style=flat-square
[dts-url]: http://definitelytyped.org

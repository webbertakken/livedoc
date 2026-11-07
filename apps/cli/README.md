# LiveDoc CLI

`livedoc` is the command line agents and scripts read, lint and change LiveDoc documents with. The
behaviour is specified in [CLI](../../docs/specs/015-api/cli.md); the verbs themselves live in `@livedoc/agent-verbs`.

## Develop

```bash
pnpm --filter @livedoc/cli test        # every suite runs on an in-memory CliIo
pnpm --filter @livedoc/cli build       # dist/livedoc.mjs, one ESM file for Node 22+
LIVEDOC_TOKEN=livedoc_... apps/cli/dist/livedoc.mjs --help
```

`src/main.ts` runs one command from argv to an exit code; `src/io.ts` is everything it touches outside itself, which
`src/node-io.ts` provides for real and `src/testing/fake-io.ts` for the tests. Running it against a local stack is
in [Local development](../../docs/development/local-development.md#running-the-cli-from-source-optional).

import { defineProject } from '@livedoc/vitest-config';

// The CLI runs on fakes (an in-memory CliIo), so every line and branch is covered except the process wiring
// in bin.ts and node-io.ts and the fakes themselves (docs/specs/015-api/cli.md).
export default defineProject({
  test: {
    coverage: {
      exclude: ['src/bin.ts', 'src/node-io.ts', 'src/testing/**'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});

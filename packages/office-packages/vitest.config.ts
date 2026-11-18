import { defineProject } from '@livedoc/vitest-config';

// The office packages read untrusted files in the editor, the api, the MCP server and the CLI
// (docs/specs/020-import-export/office-packages.md), so every rule is covered.
export default defineProject({
  test: {
    coverage: {
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
});

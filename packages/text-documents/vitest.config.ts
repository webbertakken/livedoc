import { defineProject } from '@livedoc/vitest-config';

// The text document's model, live state and file mapping are pure and shared by the editor, the api, the MCP server
// and the CLI (docs/specs/034-text-documents/standard-mapping.md), so every rule is covered.
export default defineProject({
  test: {
    coverage: {
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
});

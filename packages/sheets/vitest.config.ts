import { defineProject } from '@livedoc/vitest-config';

// The sheets engine is pure and shared by the editor, the api and the MCP worker
// (docs/specs/029-sheets/formulas.md), so every rule is covered.
export default defineProject({
  test: {
    coverage: {
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
});

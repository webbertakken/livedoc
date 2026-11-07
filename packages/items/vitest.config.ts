import { defineProject } from '@livedoc/vitest-config';

// Items are pure and shared by the api, the editor and the offline store
// (docs/specs/026-plan/items.md), so every rule is covered.
export default defineProject({
  test: {
    coverage: {
      thresholds: { lines: 95, branches: 90, functions: 100, statements: 95 },
    },
  },
});

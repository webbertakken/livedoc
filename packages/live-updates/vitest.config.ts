import { defineProject } from '@livedoc/vitest-config';

// Small and pure: every line and branch is covered.
export default defineProject({
  test: {
    coverage: {
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});

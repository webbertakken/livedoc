import { defineProject } from '@livedoc/vitest-config';

// Forms are pure and small: every line and branch is covered (docs/specs/030-forms/forms.md §14).
export default defineProject({
  test: {
    coverage: {
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});

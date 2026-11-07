import { defineProject } from '@livedoc/vitest-config';

// The generator's logic is pure and fully covered
// (docs/specs/002-project-scope/third-party-licences.md);
// scripts/ is IO, proven by the CI build running it for real.
export default defineProject({
  test: {
    coverage: {
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});

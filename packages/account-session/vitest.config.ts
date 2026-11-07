import { defineProject } from '@livedoc/vitest-config';

// The browser's session layer is small and every path decides whether a page reads as signed in: every line and
// branch is covered (docs/specs/014-identity/auth-and-guest-access.md).
export default defineProject({
  test: {
    coverage: {
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});

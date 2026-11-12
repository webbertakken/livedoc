import { defineProject } from '@livedoc/vitest-config';

// The board reading is pure: every line and branch is covered (docs/specs/021-event-storming/board-reading.md).
export default defineProject({
  test: {
    coverage: {
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});

import { defineConfig } from 'vitest/config';

// Making the oracle corpus' answers (oracle/make-answers.oracle.ts): it needs LibreOffice, or the oracle's Drive token, so
// it runs by hand, never in the unit run (docs/specs/029-sheets/formulas.md "The oracle").
export default defineConfig({
  test: {
    include: ['oracle/**/*.oracle.ts'],
    testTimeout: 600_000,
  },
});

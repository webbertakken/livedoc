import { defineConfig } from 'vitest/config';

// Making the corpus of other suites' files (corpus/make-corpus.make.ts): it downloads Excel's from Apache POI and needs
// LibreOffice, or the oracle's Drive token, so it runs by hand, never in the unit run (docs/specs/029-sheets/
// standard-mapping.md "The corpus").
export default defineConfig({
  test: {
    include: ['corpus/**/*.make.ts'],
    testTimeout: 1_800_000,
  },
});

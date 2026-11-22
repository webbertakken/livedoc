import { defineConfig } from 'vitest/config';

// The validation of read and written files (src/validation/*.validate.ts): qpdf, poppler's pdfsig, and a corpus and
// a second renderer fetched into a cache, so it runs on its own, in CI's Office files job, never in the unit suite.
export default defineConfig({
  test: {
    include: ['src/validation/**/*.validate.ts'],
    testTimeout: 120_000,
    // The first run on a machine fetches the wider corpus: some sixty files and the second renderer's packages.
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});

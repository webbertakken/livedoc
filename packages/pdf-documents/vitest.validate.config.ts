import { defineConfig } from 'vitest/config';

// The validation of written files (src/validation/written-files.validate.ts): qpdf and poppler's pdfsig, so it runs
// on its own, in CI's Office files job, never in the unit suite.
export default defineConfig({
  test: {
    include: ['src/validation/**/*.validate.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
  },
});

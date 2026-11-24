import { defineProject } from '@livedoc/vitest-config';

// A PDF document's live changes, marks and engine are shared by the editor, the api and the CLI
// (docs/specs/035-pdf-documents/pdf-document.md), so every rule is covered.
export default defineProject({
  test: {
    coverage: {
      // The mark faces' files are generated, one URL a face, each fetched only by a browser that bakes with it.
      exclude: ['src/testing/**', 'src/validation/**', 'vitest.*.ts', 'src/mark-face-urls.ts'],
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
});

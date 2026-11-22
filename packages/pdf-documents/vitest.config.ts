import { defineProject } from '@livedoc/vitest-config';

// A PDF document's live changes, marks and engine are shared by the editor, the api and the CLI
// (docs/specs/035-pdf-documents/pdf-document.md), so every rule is covered.
export default defineProject({
  test: {
    coverage: {
      exclude: ['src/testing/**', 'vitest.*.ts'],
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
});

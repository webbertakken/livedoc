// docs/specs/035-pdf-documents/reading-surface.md "The title row": the format pill's tooltip and accessible name.
import { describe, expect, it } from 'vitest';
import { pdfPillTitle, pdfSizeText } from './pdf-pill';

describe("a PDF document's format pill", () => {
  // 'the tooltip "PDF 1.7, 14 pages, 1.2 MB" (the file's own version …)'
  it('names the file’s own version, its pages and its size', () => {
    expect(pdfPillTitle({ version: '1.7', pages: 14, bytes: 1_234_567, protected: false })).toBe(
      'PDF 1.7, 14 pages, 1.2 MB',
    );
  });

  // "… left out where the file names none"
  it('leaves the version out where the file names none, and counts one page as one', () => {
    expect(pdfPillTitle({ version: null, pages: 1, bytes: 12_400, protected: false })).toBe(
      'PDF, 1 page, 12 kB',
    );
  });

  // 'a protected file's pill carries … "Protected" in its accessible name'
  it('says a protected file is protected', () => {
    expect(pdfPillTitle({ version: '2.0', pages: 3, bytes: 2_000_000, protected: true })).toBe(
      'Protected PDF 2.0, 3 pages, 2.0 MB',
    );
  });

  it('says only what it is while the file is not read', () => {
    expect(pdfPillTitle(null)).toBe('PDF document');
  });

  it('never calls a file of a few bytes 0 kB', () => {
    expect(pdfSizeText(300)).toBe('1 kB');
    expect(pdfSizeText(999_499)).toBe('999 kB');
    expect(pdfSizeText(1_000_000)).toBe('1.0 MB');
  });
});

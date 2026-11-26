// docs/specs/035-pdf-documents/starting-and-finding.md "Starting one": a Blank PDF is a real PDF file, named as an
// untitled PDF, written by the engine's one writer (its pages are tested there, blank-pages.test.ts).
import { describe, expect, it } from 'vitest';
import { blankPdfFile } from './blank-pdf';

describe('blankPdfFile', () => {
  it('is a PDF file named as an untitled PDF', async () => {
    const file = await blankPdfFile();
    expect(file.name).toBe('Untitled PDF.pdf');
    expect(file.type).toBe('application/pdf');
    expect(new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()).slice(0, 5))).toBe(
      '%PDF-',
    );
  });
});

// docs/specs/035-pdf-documents/starting-and-finding.md "Starting one": a Blank PDF is a real PDF file, one empty A4 page
// (D224), written in the browser.
import { describe, expect, it } from 'vitest';
import { A4_POINTS, blankPdfBytes, blankPdfFile } from './blank-pdf';

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('blankPdfBytes', () => {
  it('writes a PDF 1.7 of one A4 page', () => {
    const pdf = text(blankPdfBytes());
    expect(pdf.startsWith('%PDF-1.7\n')).toBe(true);
    expect(pdf).toContain('/Type /Pages /Kids [3 0 R] /Count 1');
    expect(pdf).toContain(`/MediaBox [0 0 ${A4_POINTS.width} ${A4_POINTS.height}]`);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('points its cross-reference table at each object, and startxref at the table', () => {
    const pdf = text(blankPdfBytes());
    const xref = pdf.indexOf('\nxref\n') + 1;
    expect(Number(/startxref\n(\d+)\n/.exec(pdf)![1])).toBe(xref);
    const entries = pdf
      .slice(xref)
      .split('\n')
      .filter((line) => / 00000 n $/.test(line));
    expect(entries).toHaveLength(4);
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10));
      expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
    expect(pdf).toContain('trailer\n<< /Size 5 /Root 1 0 R >>');
  });

  it('takes another page size', () => {
    expect(text(blankPdfBytes({ width: 612, height: 792 }))).toContain('/MediaBox [0 0 612 792]');
  });
});

describe('blankPdfFile', () => {
  it('names the file as an untitled PDF', () => {
    const file = blankPdfFile();
    expect(file.name).toBe('Untitled PDF.pdf');
    expect(file.type).toBe('application/pdf');
  });
});

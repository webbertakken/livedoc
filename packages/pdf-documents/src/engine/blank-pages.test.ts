// docs/specs/035-pdf-documents/starting-and-finding.md "Starting one": a Blank PDF is a real PDF file of one empty
// page, written by the repository's one PDF writer (files-print-and-sync.md "One writer").
import { beforeAll, describe, expect, it } from 'vitest';
import type { PdfEngine } from '../engine-contract';
import { readerWasm } from '../testing/fixtures';
import { A4_POINTS, writeBlankPdf } from './blank-pages';
import { createPdfEngine } from './index';

let engine: PdfEngine;

beforeAll(async () => {
  engine = await createPdfEngine({ wasm: readerWasm() });
});

describe('a Blank PDF', () => {
  it('opens as one empty A4 page, white all over', async () => {
    const opened = await engine.open(await writeBlankPdf());
    if (!opened.ok) throw new Error('the written file did not open');
    expect(opened.pages).toHaveLength(1);
    // Points are stored as single-precision numbers: A4's sides read back within a hundredth.
    expect(opened.pages[0]!.width).toBeCloseTo(A4_POINTS.width, 2);
    expect(opened.pages[0]!.height).toBeCloseTo(A4_POINTS.height, 2);
    const drawn = (await engine.drawPage(0, 0.1))!;
    for (const at of [0, drawn.rgba.length - 4])
      expect([...drawn.rgba.slice(at, at + 4)]).toEqual([255, 255, 255, 255]);
  });

  it('takes another page size, and names LiveDoc as what made it, with no author', async () => {
    const bytes = await writeBlankPdf(
      { width: 612, height: 792 },
      new Date(Date.UTC(2026, 10, 26)),
    );
    const opened = await engine.open(bytes);
    if (!opened.ok) throw new Error('the written file did not open');
    expect(opened.pages.map((page) => [page.width, page.height])).toEqual([[612, 792]]);
    expect(opened.document.properties).toMatchObject({ producer: 'LiveDoc', author: '' });
  });
});

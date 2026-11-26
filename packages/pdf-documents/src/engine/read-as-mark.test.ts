// marks.md "Changing a mark": a file's mark as LiveDoc reads it. A mark saved here and opened again is read back as
// the mark it was; a mark another program wrote is read from the standard's own entries; one LiveDoc cannot read so
// is none.
import { beforeAll, describe, expect, it } from 'vitest';
import type { FileMark, PdfEngine, PdfOpened } from '../engine-contract';
import { PdfLiveChanges } from '../live-changes';
import { Mark } from '../mark';
import { PdfChange, PdfChangeset } from '../pdf-change';
import { markFaceFiles, rawPdf, readerWasm, textPdf } from '../testing/fixtures';
import { createPdfEngine } from './index';

let engine: PdfEngine;

beforeAll(async () => {
  engine = await createPdfEngine({ wasm: readerWasm(), faces: markFaceFiles });
});

const opened = (result: PdfOpened) => {
  if (!result.ok) throw new Error('the fixture did not open');
  return result.pages;
};
const at = Date.UTC(2026, 10, 22, 9, 30, 15);
const later = Date.UTC(2026, 10, 23, 10, 0, 0);

/** Numbers within a hundredth of a point, as the reader answers single precision; everything else equal. */
function near(actual: unknown, expected: unknown, path = 'mark'): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), `${path} ${String(actual)}`).toBeLessThan(0.01);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((item, n) => near((actual as unknown[])[n], item, `${path}[${n}]`));
    return;
  }
  if (typeof expected === 'object' && expected !== null) {
    expect(Object.keys(actual as object).toSorted(), path).toEqual(
      Object.keys(expected).toSorted(),
    );
    for (const [key, value] of Object.entries(expected))
      near((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
    return;
  }
  expect(actual, path).toEqual(expected);
}

describe('a mark saved here, opened again', () => {
  it('is read back as the mark it was, of every kind and look', async () => {
    const stored = await textPdf(1);
    const pages = opened(await engine.open(stored));
    const page = pages[0]!.name;
    const selection = await engine.selectText(0, { x: 74, y: 724 }, { x: 180, y: 724 });
    const base = { page, opacity: 1, author: 'Ada Lovelace', createdAt: at, modifiedAt: later };
    const values = [
      {
        ...base,
        id: 'hl',
        kind: 'highlight',
        colour: '#fdf1a9',
        opacity: 0.5,
        quads: selection!.quads,
        text: selection!.text,
      },
      {
        ...base,
        id: 'sq',
        kind: 'squiggly',
        colour: '#d93025',
        quads: selection!.quads,
        text: selection!.text,
      },
      {
        ...base,
        id: 'dr',
        kind: 'drawing',
        colour: '#1a73e8',
        width: 3,
        strokes: [
          [100, 500, 120, 520, 140, 505],
          [150, 500, 170, 480],
        ],
      },
      {
        ...base,
        id: 'dd',
        kind: 'drawing',
        colour: '#1a73e8',
        width: 2,
        lineStyle: 'dotted',
        strokes: [[100, 400, 160, 430]],
      },
      {
        ...base,
        id: 'ln',
        kind: 'line',
        colour: '#000000',
        width: 1.5,
        line: [300, 500, 400, 560],
      },
      {
        ...base,
        id: 'le',
        kind: 'line',
        colour: '#000000',
        width: 2,
        lineEnd: 'diamond',
        lineStyle: 'dash-dot',
        line: [300, 450, 400, 450],
      },
      { ...base, id: 'ar', kind: 'arrow', colour: '#d93025', width: 4, line: [300, 400, 420, 380] },
      {
        ...base,
        id: 'an',
        kind: 'arrow',
        colour: '#d93025',
        width: 4,
        lineEnd: 'none',
        line: [300, 350, 420, 330],
      },
      {
        ...base,
        id: 're',
        kind: 'rectangle',
        colour: '#188038',
        width: 4,
        rect: [100, 200, 220, 260],
      },
      {
        ...base,
        id: 'el',
        kind: 'ellipse',
        colour: '#188038',
        width: 6,
        lineStyle: 'long-dashes',
        fill: '#fce8e6',
        rect: [250, 200, 330, 280],
      },
      {
        ...base,
        id: 'tx',
        kind: 'text',
        colour: '#202124',
        words: 'Check the totals',
        size: 14,
        rect: [100, 100, 260, 140],
      },
      {
        ...base,
        id: 'tj',
        kind: 'text',
        colour: '#202124',
        words: 'Justified words here',
        size: 12,
        align: 'justified',
        rect: [300, 100, 420, 150],
      },
      {
        ...base,
        id: 'tf',
        kind: 'text',
        colour: '#202124',
        words: 'In Lora, justified',
        size: 12,
        align: 'justified',
        font: 'Lora',
        rect: [100, 300, 220, 350],
      },
      {
        ...base,
        id: 'tm',
        kind: 'text',
        colour: '#202124',
        words: 'In Merriweather',
        size: 12,
        font: 'Merriweather',
        rect: [300, 300, 420, 350],
      },
      {
        ...base,
        id: 'tr',
        kind: 'text',
        colour: '#202124',
        words: 'Right',
        size: 12,
        align: 'right',
        rect: [450, 100, 560, 130],
      },
      {
        ...base,
        id: 'co',
        kind: 'callout',
        colour: '#d93025',
        words: 'This one',
        size: 12,
        align: 'centre',
        rect: [400, 600, 500, 640],
        callout: [350, 700, 375, 620, 400, 620],
      },
      {
        ...base,
        id: 'st',
        kind: 'stamp',
        colour: '#c5221f',
        stamp: 'not-approved',
        lines: ['NOT APPROVED'],
        rect: [100, 650, 260, 690],
      },
      {
        ...base,
        id: 'sd',
        kind: 'stamp',
        colour: '#086f1e',
        stamp: 'approved-by',
        lines: ['APPROVED', 'by Ada Lovelace, 22 Nov 2026, 14:02'],
        rect: [300, 650, 480, 695],
      },
    ];
    const marks = values.map((value) => Mark.parse(value)!);
    expect(marks.every(Boolean)).toBe(true);
    const doc = PdfLiveChanges.load();
    const made = PdfChangeset.apply(doc, marks.map(PdfChange.addMark));
    if (!made.ok) throw new Error(made.refusal);
    const baked = await engine.bake(PdfLiveChanges.encode(doc));
    if (!baked.ok) throw new Error(baked.refusal);

    opened(await engine.open(baked.bytes));
    const read = new Map((await engine.fileMarks(0)).map((mark) => [mark.id, mark.mark]));
    for (const mark of marks) near(read.get(mark.id), mark, mark.id);
  });
});

/** One page holding the annotations given, as objects 4 on. */
const pageWith = (annotations: readonly string[]) =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Annots [${annotations.map((_, n) => `${n + 4} 0 R`).join(' ')}] >>`,
    ...annotations,
  ]);

describe('a file’s mark changed here', () => {
  it('is written in place of the file’s own, under its own id, and read back changed', async () => {
    opened(
      await engine.open(
        pageWith([
          '<< /Type /Annot /Subtype /Square /NM (theirs) /Rect [98 198 222 262] /C [0 0 1] /BS << /W 4 >> >>',
        ]),
      ),
    );
    const [read] = await engine.fileMarks(0);
    const moved = Mark.parse({ ...read!.mark!, rect: [300, 400, 420, 460] })!;
    const doc = PdfLiveChanges.load();
    PdfChangeset.apply(doc, [PdfChange.removeFromFile('theirs', 'mark'), PdfChange.addMark(moved)]);
    const baked = await engine.bake(PdfLiveChanges.encode(doc));
    if (!baked.ok) throw new Error(baked.refusal);

    opened(await engine.open(baked.bytes));
    const after = await engine.fileMarks(0);
    expect(after.map((mark) => mark.id)).toEqual(['theirs']);
    near(after[0]!.mark, moved);
  });
});

describe('a mark another program wrote', () => {
  async function readFrom(annotations: readonly string[]): Promise<readonly FileMark[]> {
    opened(await engine.open(pageWith(annotations)));
    return engine.fileMarks(0);
  }

  it('is read from the standard’s own entries, each value held within a mark’s bounds', async () => {
    const [square, text, ink, line, stamp] = await readFrom([
      '<< /Type /Annot /Subtype /Square /Rect [95 195 225 265] /RD [2 2 2 2] /C [0 0.6 0] /IC [1 1 0] /BS << /W 6 >> /T (Grace) /CreationDate (D:20261120090000Z) >>',
      "<< /Type /Annot /Subtype /FreeText /NM ({5F3C-77}) /Rect [100 100 300 150] /Contents (Hello) /DA (/Helv 300 Tf 0 0 1 rg) /M (D:20261121150203+01'00') >>",
      '<< /Type /Annot /Subtype /Ink /InkList [[10 10 20 20] [30 30 40 45]] /BS << /W 40 >> /CA 0.02 >>',
      '<< /Type /Annot /Subtype /Line /L [10 10 200 10] /LE [/None /ClosedArrow] /IT /LineArrow /C [1 0 0] >>',
      '<< /Type /Annot /Subtype /Stamp /Rect [100 600 300 650] /Name /Approved >>',
    ]);
    expect(square!.mark).toMatchObject({
      id: 'o:4',
      kind: 'rectangle',
      colour: '#009900',
      fill: '#ffff00',
      width: 6,
      rect: [100, 200, 220, 260],
      author: 'Grace',
      createdAt: Date.UTC(2026, 10, 20, 9),
      modifiedAt: Date.UTC(2026, 10, 20, 9),
    });
    expect(text!.mark).toMatchObject({
      id: '{5F3C-77}',
      kind: 'text',
      colour: '#0000ff',
      size: 144,
      words: 'Hello',
      rect: [100, 100, 300, 150],
      createdAt: Date.UTC(2026, 10, 21, 14, 2, 3),
    });
    expect(text!.mark).not.toHaveProperty('align');
    expect(ink!.mark).toMatchObject({
      kind: 'drawing',
      colour: '#000000',
      opacity: 0.1,
      width: 12,
      strokes: [
        [10, 10, 20, 20],
        [30, 30, 40, 45],
      ],
      createdAt: 0,
    });
    expect(line!.mark).toMatchObject({ kind: 'arrow', lineEnd: 'arrow', line: [10, 10, 200, 10] });
    expect(stamp!.mark).toMatchObject({
      kind: 'stamp',
      stamp: 'approved',
      lines: ['APPROVED'],
    });
  });

  it('is none where LiveDoc cannot read it as one of its own', async () => {
    const marks = await readFrom([
      '<< /Type /Annot /Subtype /Text /Rect [10 10 30 30] /Contents (A note) >>',
      '<< /Type /Annot /Subtype /Stamp /Rect [100 600 300 650] /Name /OurOwnLogo >>',
      '<< /Type /Annot /Subtype /FreeText /Rect [100 100 300 150] /Contents (   ) /DA (/Helv 12 Tf 0 g) >>',
      '<< /Type /Annot /Subtype /Square /NM (a b) /Rect [10 10 30 30] >>',
      '<< /Type /Annot /Subtype /Ink /InkList [] >>',
      '<< /Type /Annot /Subtype /Polygon /Rect [10 10 30 30] /Vertices [10 10 30 10] >>',
    ]);
    expect(marks.map((mark) => mark.mark)).toEqual([null, null, null, null, null, null]);
  });
});

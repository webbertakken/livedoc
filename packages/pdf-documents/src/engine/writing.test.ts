import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BakeResult, PdfEngine, PdfOpened } from '../engine-contract';
import { PdfLiveChanges } from '../live-changes';
import { Mark } from '../mark';
import { StampLayout } from '../stamp-layout';
import type { PageName } from '../page-name';
import { PdfChange, PdfChangeset } from '../pdf-change';
import { corpusBytes, corpusFiles } from '../testing/corpus';
import {
  embeddedFilesPdf,
  formPdf,
  labelledPdf,
  layersPdf,
  markFaceFiles,
  marksPdf,
  outlinePdf,
  pngOf,
  privateDataPdf,
  protectedPdf,
  rawPdf,
  readerWasm,
  signedPdf,
  spoiled,
  textPdf,
} from '../testing/fixtures';
import { createPdfEngine } from './index';

let engine: PdfEngine;
let stored: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
  engine = await createPdfEngine({ wasm: readerWasm(), faces: markFaceFiles });
  stored = await textPdf(2);
});

const opened = (result: PdfOpened) => {
  if (!result.ok) throw new Error('the fixture did not open');
  return result.pages;
};
const baked = (result: BakeResult) => {
  if (!result.ok) throw new Error(result.refusal);
  return result;
};
const at = Date.UTC(2026, 10, 22);
const fill = (field: string, value: string | string[]) =>
  PdfChange.fill({ field, value, by: 'Ada', at });
/** The open file baked with the changes given. */
async function bakeWith(changes: readonly PdfChange[]) {
  const doc = PdfLiveChanges.load();
  const made = PdfChangeset.apply(doc, changes);
  if (!made.ok) throw new Error(made.refusal);
  return baked(await engine.bake(PdfLiveChanges.encode(doc)));
}
/** A highlight over the fixture's line on the page of the open file given. */
async function highlightOn(pageIndex: number, pages: ReturnType<typeof opened>, id = 'mark-1') {
  const selection = await engine.selectText(pageIndex, { x: 74, y: 724 }, { x: 180, y: 724 });
  return PdfChange.addMark(
    Mark.highlight({
      id,
      page: pages[pageIndex]!.name,
      quads: selection!.quads,
      text: selection!.text,
      colour: '#fdf1a9',
      opacity: 1,
      author: 'Ada',
      createdAt: at,
    })!,
  );
}
const startsWith = (bytes: Uint8Array, prefix: Uint8Array) =>
  bytes.length > prefix.length && prefix.every((byte, n) => bytes[n] === byte);
const qpdfChecks = (bytes: Uint8Array, skip: (note?: string) => void, password?: string) => {
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-writing-')), 'baked.pdf');
  writeFileSync(file, bytes);
  try {
    execFileSync('qpdf', ['--version'], { stdio: 'ignore' });
  } catch {
    skip('qpdf is not installed');
  }
  const args = password ? [`--password=${password}`, '--check', file] : ['--check', file];
  return execFileSync('qpdf', args, { encoding: 'utf8' });
};

// fields.md "In the file"; saving.md "Addition or rewrite": field values are an addition.
describe('writing field values', () => {
  it('writes each value into its field as an addition, read back by any reader', async ({
    skip,
  }) => {
    const form = formPdf();
    opened(await engine.open(form));
    const result = await bakeWith([
      fill('applicant.city', 'Leiden'),
      fill('agree', 'Off'),
      fill('colour', 'red'),
      fill('country', 'Option 3'),
      fill('languages', ['Option 2']),
    ]);
    expect(result).toMatchObject({ kind: 'addition', anchorsLost: 0, fieldsLost: 0 });
    expect(startsWith(result.bytes, form)).toBe(true);
    opened(await engine.open(result.bytes));
    const read = new Map(
      (await engine.fields(0)).map((field) => [`${field.name}/${field.onValue}`, field]),
    );
    expect(read.get('applicant.city/')!.value).toBe('Leiden');
    expect(read.get('agree/Yes')!.on).toBe(false);
    expect(read.get('colour/red')!.on).toBe(true);
    expect(read.get('colour/blue')!.on).toBe(false);
    expect(read.get('country/')!.value).toBe('Option 3');
    expect(read.get('languages/')!.options.map((option) => option.chosen)).toEqual([
      false,
      true,
      false,
    ]);
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
  });

  it('turns a tick box on by any value but Off', async () => {
    opened(await engine.open(formPdf()));
    const off = await bakeWith([fill('agree', 'Off')]);
    opened(await engine.open(off.bytes));
    const on = await bakeWith([fill('agree', 'Yes')]);
    opened(await engine.open(on.bytes));
    expect((await engine.fields(0)).find((field) => field.name === 'agree')!.on).toBe(true);
  });

  it('counts a value the file’s field does not take, and writes the rest', async () => {
    opened(await engine.open(formPdf()));
    const result = await bakeWith([
      fill('applicant.city', 'Leiden'),
      fill('no.such.field', 'x'),
      fill('notes', 'read-only'),
      fill('signature', 'Ada'),
      fill('send', 'pressed'),
      fill('country', ['two', 'values']),
      fill('colour', 'green'),
      fill('languages', 'not a list'),
    ]);
    expect(result).toMatchObject({ kind: 'addition', fieldsLost: 7 });
    opened(await engine.open(result.bytes));
    const fields = await engine.fields(0);
    expect(fields.find((field) => field.name === 'applicant.city')!.value).toBe('Leiden');
    expect(fields.find((field) => field.name === 'notes')!.value).toBe('Line one');
  });

  it('counts every value for a file with no form', async () => {
    opened(await engine.open(stored));
    expect(await bakeWith([fill('applicant.city', 'Leiden')])).toMatchObject({
      kind: 'addition',
      fieldsLost: 1,
    });
  });
});

// marks.md "In the file": a mark deleted in LiveDoc is written as the removed annotation in the same addition.
// marks.md "Kinds", "In the file": each kind that marks text is written as the standard's own subtype, under its id.
describe('writing marks', () => {
  it('writes a highlight, an underline, a strikethrough and a squiggle, each read back as its kind', async () => {
    const pages = opened(await engine.open(stored));
    const selection = await engine.selectText(0, { x: 74, y: 724 }, { x: 180, y: 724 });
    const kinds = ['highlight', 'underline', 'strikeout', 'squiggly'] as const;
    const result = await bakeWith(
      kinds.map((kind) =>
        PdfChange.addMark(
          Mark.ofText(kind, {
            id: kind,
            page: pages[0]!.name,
            quads: selection!.quads,
            text: selection!.text,
            colour: '#d93025',
            opacity: 1,
            author: 'Ada',
            createdAt: at,
          })!,
        ),
      ),
    );
    expect(result.kind).toBe('addition');
    opened(await engine.open(result.bytes));
    const read = await engine.fileMarks(0);
    // The live changes keep marks by id, so they are written in no order of making.
    expect(read.map((mark) => [mark.id, mark.subtype]).toSorted()).toEqual(
      kinds.map((kind) => [kind, kind]).toSorted(),
    );
    expect(read.map((mark) => [mark.colour, mark.quads.length])).toEqual(
      kinds.map(() => ['#d93025', 1]),
    );
  });

  // marks.md "Kinds": a Drawing is written as an Ink annotation, its strokes, colour, opacity and author with it.
  it('writes a Drawing as an Ink annotation, read back by its id', async () => {
    const pages = opened(await engine.open(stored));
    const drawing = Mark.drawing({
      id: 'sketch',
      page: pages[0]!.name,
      strokes: [
        [100, 600, 150, 650, 200, 600],
        [120, 580, 180, 580],
      ],
      width: 2,
      colour: '#7c3aed',
      opacity: 0.5,
      author: 'Ada',
      createdAt: at,
    })!;
    const result = await bakeWith([PdfChange.addMark(drawing)]);
    expect(result.kind).toBe('addition');
    expect(Buffer.from(result.bytes).toString('latin1')).toContain('/InkList');
    opened(await engine.open(result.bytes));
    const [read] = await engine.fileMarks(0);
    expect(read).toMatchObject({ id: 'sketch', subtype: 'ink', colour: '#7c3aed', author: 'Ada' });
    expect(read!.opacity).toBeCloseTo(0.5, 2);
    expect(read!.rect[0]).toBeLessThanOrEqual(100);
    expect(read!.rect[2]).toBeGreaterThanOrEqual(200);
  });
});

// marks.md "In the file": a Line is written with its ends as `L`, an Arrow's head as `LE`; a Rectangle and an Ellipse
// with their box grown by half the line; each with an appearance stream of LiveDoc's own, which the engine draws.
describe('writing lines and shapes', () => {
  const red = '#d93025';
  const base = (id: string, page: PageName) => ({
    id,
    page,
    width: 4,
    colour: red,
    opacity: 1,
    author: 'Ada',
    createdAt: at,
  });
  /** Whether the drawn page is the mark's red near a point of page space (the fixture's page is 612 by 792). */
  const redAt = (
    drawn: { width: number; height: number; rgba: Uint8ClampedArray },
    x: number,
    y: number,
  ) => {
    const at = ((drawn.height - Math.round(y)) * drawn.width + Math.round(x)) * 4;
    const [r, g, b] = drawn.rgba.slice(at, at + 3);
    return r! > 180 && g! < 110 && b! < 110;
  };

  it('writes a Line, an Arrow, a Rectangle and an Ellipse, each read back by its id and drawn', async () => {
    const pages = opened(await engine.open(stored));
    const page = pages[0]!.name;
    const marks = [
      Mark.line('line', { ...base('a-line', page), line: [100, 300, 250, 300] })!,
      Mark.line('arrow', { ...base('an-arrow', page), line: [100, 400, 250, 400] })!,
      Mark.shape('rectangle', { ...base('a-box', page), rect: [300, 300, 400, 380] })!,
      Mark.shape('ellipse', { ...base('a-ring', page), rect: [420, 300, 560, 380], opacity: 0.5 })!,
    ];
    const result = await bakeWith(marks.map((mark) => PdfChange.addMark(mark)));
    expect(result.kind).toBe('addition');
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added).toContain('/LE [/None /OpenArrow]');
    opened(await engine.open(result.bytes));
    // In the order of their ids, as the live changes keep them.
    const read = await engine.fileMarks(0);
    expect(read.map(({ id, subtype, colour }) => [id, subtype, colour])).toEqual([
      ['a-box', 'square', red],
      ['a-line', 'line', red],
      ['a-ring', 'circle', red],
      ['an-arrow', 'line', red],
    ]);
    // A Rectangle's box grown by half its line, so the line falls where it was drawn.
    expect(read[0]!.rect).toEqual([298, 298, 402, 382]);
    expect(read[2]!.opacity).toBeCloseTo(0.5, 2);
    const drawn = (await engine.drawPage(0, 1))!;
    expect(redAt(drawn, 175, 300)).toBe(true);
    // The Arrow's head: a point on its upper side, 8 points back from the tip at 30°.
    expect(redAt(drawn, 250 - 8 * Math.cos(Math.PI / 6), 400 + 8 * Math.sin(Math.PI / 6))).toBe(
      true,
    );
    expect(redAt(drawn, 300, 340)).toBe(true);
    expect(redAt(drawn, 350, 380)).toBe(true);
    expect(redAt(drawn, 350, 340)).toBe(false);
  });
});

// marks.md "In the file": a line style other than Solid as `BS` `S` `D` with `D` its pattern, a Drawing's too; a fill as
// `IC`, painted inside the line by the appearance.
describe('writing a line style and a fill', () => {
  it('writes a dashed, filled Rectangle and a dotted Drawing, drawn as the page shows them', async () => {
    const pages = opened(await engine.open(stored));
    const page = pages[0]!.name;
    const look = { page, colour: '#d93025', opacity: 1, author: 'Ada', createdAt: at };
    const marks = [
      Mark.parse({
        ...look,
        id: 'a-box',
        kind: 'rectangle',
        rect: [300, 300, 400, 380],
        width: 2,
        lineStyle: 'dashed',
        fill: '#1a73e8',
        modifiedAt: at,
      })!,
      Mark.parse({
        ...look,
        id: 'a-sketch',
        kind: 'drawing',
        strokes: [[100, 500, 200, 500]],
        width: 2,
        lineStyle: 'dotted',
        modifiedAt: at,
      })!,
    ];
    const result = await bakeWith(marks.map((mark) => PdfChange.addMark(mark)));
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added).toMatch(/\/S \/D/);
    expect(added).toContain('/D [6 4]');
    expect(added).toContain('/D [2 2]');
    expect(added).toMatch(/\/IC \[0\.1\d* 0\.45\d* 0\.91\d*\]/);
    opened(await engine.open(result.bytes));
    const drawn = (await engine.drawPage(0, 1))!;
    const at350 = ((drawn.height - 340) * drawn.width + 350) * 4;
    const [r, g, b] = drawn.rgba.slice(at350, at350 + 3);
    expect([r! < 60, g! > 90 && g! < 140, b! > 200]).toEqual([true, true, true]);
  });

  // marks.md "In the file": a Line's second end as `LE`, the standard's names for LiveDoc's ends.
  it('writes each line end as the standard names it, and no end at all for None', async () => {
    const pages = opened(await engine.open(stored));
    const page = pages[0]!.name;
    const look = { page, colour: '#d93025', opacity: 1, author: 'Ada', createdAt: at, width: 2 };
    const ends = ['arrow', 'circle', 'square', 'diamond', 'bar', 'none'] as const;
    const marks = ends.map((lineEnd, n) =>
      Mark.parse({
        ...look,
        id: `end-${n}`,
        kind: 'arrow',
        line: [100, 300 + n * 40, 250, 300 + n * 40],
        lineEnd,
        modifiedAt: at,
      })!,
    );
    const result = await bakeWith(marks.map((mark) => PdfChange.addMark(mark)));
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    for (const name of ['ClosedArrow', 'Circle', 'Square', 'Diamond', 'Butt'])
      expect(added).toContain(`/LE [/None /${name}]`);
    expect(added.match(/\/LE /g)).toHaveLength(5);
  });
});

// marks.md "In the file": a Text is a FreeText with its words as Contents and an appearance of LiveDoc's own; a Callout
// adds IT FreeTextCallout, CL, LE OpenArrow and RD. The engine draws no FreeText without an appearance.
describe('writing a Text and a Callout', () => {
  const red = '#d93025';
  const base = (id: string, page: PageName) => ({
    id,
    page,
    words: 'MMMM MMMM',
    size: 36,
    colour: red,
    opacity: 1,
    author: 'Ada',
    createdAt: at,
  });
  /** How many of the drawn page's pixels in a box of page space are the mark's red (the page is 612 by 792). */
  const redIn = (
    drawn: { width: number; height: number; rgba: Uint8ClampedArray },
    [left, bottom, right, top]: readonly [number, number, number, number],
  ) => {
    let count = 0;
    for (let y = Math.round(bottom); y < top; y += 1)
      for (let x = Math.round(left); x < right; x += 1) {
        const at = ((drawn.height - y) * drawn.width + x) * 4;
        const [r, g, b] = drawn.rgba.slice(at, at + 3);
        if (r! > 180 && g! < 110 && b! < 110) count += 1;
      }
    return count;
  };

  it('writes each as a FreeText, read back by its id with its words, and drawn', async ({
    skip,
  }) => {
    const pages = opened(await engine.open(stored));
    const page = pages[0]!.name;
    const marks = [
      Mark.text({ ...base('a-text', page), rect: [100, 300, 300, 400] })!,
      Mark.callout({
        ...base('a-callout', page),
        words: 'Cost (net) \\ 5 €',
        size: 12,
        rect: [300, 500, 450, 530],
        callout: [100, 600, 288, 515, 300, 515],
      })!,
    ];
    const result = await bakeWith(marks.map((mark) => PdfChange.addMark(mark)));
    expect(result.kind).toBe('addition');
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added).toContain('/IT /FreeTextCallout');
    expect(added).toContain('/LE /OpenArrow');
    expect(added).toContain('/DA (/Helv 36 Tf');
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
    opened(await engine.open(result.bytes));
    const read = await engine.fileMarks(0);
    expect(read.map(({ id, subtype, words }) => [id, subtype, words])).toEqual([
      ['a-callout', 'freetext', 'Cost (net) \\ 5 €'],
      ['a-text', 'freetext', 'MMMM MMMM'],
    ]);
    // The Callout's Rect takes in its line, from what is meant to the box, grown by its 1-point line.
    expect(read[0]!.rect[0]).toBeLessThan(100);
    expect(read[0]!.rect[3]).toBeGreaterThan(600);
    const drawn = (await engine.drawPage(0, 1))!;
    // The Text's words, in its box; nothing outside it.
    expect(redIn(drawn, [100, 300, 300, 400])).toBeGreaterThan(200);
    expect(redIn(drawn, [100, 200, 300, 290])).toBe(0);
    // The Callout's line, half way between what is meant and its knee.
    expect(redIn(drawn, [190, 552, 198, 562])).toBeGreaterThan(0);
  });

  // marks.md "In the file": an alignment once chosen as Q, Justified as Q 0 with DS text-align:justify.
  it('writes an alignment chosen as Q, Justified as its default style, and none until one is', async () => {
    const pages = opened(await engine.open(stored));
    const page = pages[0]!.name;
    const aligns = [undefined, 'left', 'centre', 'right', 'justified'] as const;
    const marks = aligns.map((align, n) =>
      Mark.text({
        ...base(`aligned-${n}`, page),
        size: 12,
        rect: [100, 100 + n * 100, 300, 180 + n * 100],
        ...(align ? { align } : {}),
      })!,
    );
    const result = await bakeWith(marks.map((mark) => PdfChange.addMark(mark)));
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added.match(/\/Q 0/g)).toHaveLength(2);
    expect(added).toContain('/Q 1');
    expect(added).toContain('/Q 2');
    expect(added.match(/\/DS \(text-align:justify\)/g)).toHaveLength(1);
  });

  // marks.md "In the file": a chosen font as DS font-family, DA naming Helvetica still; its family embedded.
  it('writes a chosen font as its default style, and embeds its family', async () => {
    const pages = opened(await engine.open(stored));
    const page = pages[0]!.name;
    const marks = [
      Mark.text({ ...base('in-lora', page), size: 12, rect: [100, 100, 300, 180], font: 'Lora' })!,
      Mark.text({
        ...base('in-lora-justified', page),
        size: 12,
        rect: [100, 300, 300, 380],
        font: 'Lora',
        align: 'justified',
      })!,
    ];
    const result = await bakeWith(marks.map((mark) => PdfChange.addMark(mark)));
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added).toContain("/DS (font-family:'Lora')");
    expect(added).toContain("/DS (font-family:'Lora'; text-align:justify)");
    expect(added.match(/\/DA \(\/Helv 12 Tf/g)).toHaveLength(2);
    expect(added).toMatch(/\/BaseFont \/[A-Z]{6}\+Lora-Regular/);
  });
});

// marks.md "In the file": a stamp is a Stamp with Name the standard's name for it, Contents its words a line each, and
// an appearance in LiveDoc's style, its name in Helvetica Bold.
describe('writing a stamp', () => {
  const green = '#086f1e';
  const greenIn = (
    drawn: { width: number; height: number; rgba: Uint8ClampedArray },
    [left, bottom, right, top]: readonly [number, number, number, number],
  ) => {
    let count = 0;
    for (let y = Math.round(bottom); y < top; y += 1)
      for (let x = Math.round(left); x < right; x += 1) {
        const at = ((drawn.height - y) * drawn.width + x) * 4;
        const [r, g, b] = drawn.rgba.slice(at, at + 3);
        if (g! > 80 && r! < 60 && b! < 80) count += 1;
      }
    return count;
  };

  it('writes each as a Stamp under its name, read back by its id with its words, and drawn', async ({
    skip,
  }) => {
    const pages = opened(await engine.open(stored));
    const page = pages[0]!.name;
    const base = { page, colour: green, opacity: 1, author: 'Ada', createdAt: at };
    const marks = [
      Mark.stamp({
        ...base,
        id: 'a-stamp',
        rect: [100, 300, 260, 340],
        stamp: 'not-approved',
        lines: ['NOT APPROVED'],
      })!,
      Mark.stamp({
        ...base,
        id: 'a-dynamic-stamp',
        rect: [300, 300, 480, 345],
        stamp: 'approved-by',
        lines: ['APPROVED', 'by Ada Lovelace, 22 Nov 2026, 14:02'],
      })!,
      Mark.stamp({
        ...base,
        id: 'my-own',
        rect: [100, 400, 200, 430],
        stamp: 'paid',
        lines: ['PAID'],
      })!,
    ];
    const result = await bakeWith(marks.map((mark) => PdfChange.addMark(mark)));
    expect(result.kind).toBe('addition');
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added).toContain('/Subtype /Stamp');
    expect(added).toContain('/Name /NotApproved');
    expect(added).toContain('/Name /Approved');
    expect(added).toContain('/Name /paid');
    expect(added).toContain('/BaseFont /Helvetica-Bold');
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
    opened(await engine.open(result.bytes));
    const read = await engine.fileMarks(0);
    expect(read.map(({ id, subtype, words }) => [id, subtype, words])).toEqual([
      ['a-dynamic-stamp', 'stamp', 'APPROVED\nby Ada Lovelace, 22 Nov 2026, 14:02'],
      ['a-stamp', 'stamp', 'NOT APPROVED'],
      ['my-own', 'stamp', 'PAID'],
    ]);
    // Its Rect is its box grown by its border, scaled with the stamp to fill the box: every line whole inside it.
    expect(read[1]!.rect[0]).toBeCloseTo(100 - StampLayout.border(marks[0]!).width, 3);
    const drawn = (await engine.drawPage(0, 1))!;
    expect(greenIn(drawn, [100, 300, 260, 340])).toBeGreaterThan(200);
    expect(greenIn(drawn, [100, 200, 260, 290])).toBe(0);
  });

  // marks.md "A stamp's quarter turns": drawn upright, turned by its appearance's Matrix, `Rotate` its turn, `Rect` the
  // box as it shows; read back turned, its upright box found again; drawn where it shows.
  it('writes a turned stamp with Rotate and its appearance turned, and reads it back turned', async ({
    skip,
  }) => {
    const pages = opened(await engine.open(stored));
    const page = pages[0]!.name;
    const turned = Mark.stamp({
      page,
      colour: green,
      opacity: 1,
      author: 'Ada',
      createdAt: at,
      id: 'turned',
      rect: [100, 300, 260, 340],
      stamp: 'not-approved',
      lines: ['NOT APPROVED'],
      turn: 90,
    })!;
    const result = await bakeWith([PdfChange.addMark(turned)]);
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added).toContain('/Rotate 90');
    expect(added).toMatch(/\/Matrix \[0 1 -1 0 /);
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
    opened(await engine.open(result.bytes));
    const [read] = await engine.fileMarks(0);
    // Its Rect is the box as it shows: tall, about the same middle.
    const [left, bottom, right, top] = read!.rect;
    expect(top - bottom).toBeGreaterThan(right - left);
    expect(read!.mark).toMatchObject({ kind: 'stamp', turn: 90 });
    const rect = (read!.mark as typeof turned).rect;
    [100, 300, 260, 340].forEach((n, i) => expect(rect[i]).toBeCloseTo(n, 2));
    const drawn = (await engine.drawPage(0, 1))!;
    expect(greenIn(drawn, [170, 250, 190, 390])).toBeGreaterThan(50);
    expect(greenIn(drawn, [100, 300, 140, 340])).toBe(0);
  });
});

// custom-stamps.md "Placing one": a custom stamp is a `Stamp` named `#` and its id, its picture its appearance.
describe('writing a custom stamp', () => {
  const ID = 'custom-0b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a';
  const KEY = 'd'.repeat(64);
  const custom = (page: PageName, over: Partial<Parameters<typeof Mark.stamp>[0]> = {}) =>
    Mark.stamp({
      page,
      colour: '#000000',
      opacity: 1,
      author: 'Ada',
      createdAt: at,
      id: 'paid',
      rect: [100, 300, 200, 350],
      stamp: ID,
      lines: ['Paid'],
      picture: { key: KEY as never, type: 'png', width: 8, height: 4 },
      ...over,
    })!;
  const bakeCustom = async (mark: Mark, pictures: ReadonlyMap<string, Uint8Array>) => {
    const doc = PdfLiveChanges.load();
    PdfChangeset.apply(doc, [PdfChange.addMark(mark)]);
    return engine.bake(PdfLiveChanges.encode(doc), pictures);
  };
  const redIn = (
    drawn: { width: number; height: number; rgba: Uint8ClampedArray },
    [left, bottom, right, top]: readonly [number, number, number, number],
  ) => {
    let count = 0;
    for (let y = Math.round(bottom); y < top; y += 1)
      for (let x = Math.round(left); x < right; x += 1) {
        const at = ((drawn.height - y) * drawn.width + x) * 4;
        const [r, g, b] = drawn.rgba.slice(at, at + 3);
        if (r! > 200 && g! < 60 && b! < 60) count += 1;
      }
    return count;
  };

  it('writes its picture across its box, named # and its id, and draws it there', async ({
    skip,
  }) => {
    const pages = opened(await engine.open(stored));
    const picture = pngOf(8, 4, [220, 20, 20, 255]);
    const result = baked(await bakeCustom(custom(pages[0]!.name), new Map([[KEY, picture]])));
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added).toContain('/Subtype /Stamp');
    expect(added).toContain(`/Name /#23${ID}`);
    expect(added).toContain('/Subtype /Image');
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
    opened(await engine.open(result.bytes));
    const [read] = await engine.fileMarks(0);
    // A `#` stamp is one LiveDoc does not draw: read as the file's, its words its name.
    expect(read).toMatchObject({ id: 'paid', subtype: 'stamp', words: 'Paid' });
    expect(read!.mark).toBeNull();
    const drawn = (await engine.drawPage(0, 1))!;
    expect(redIn(drawn, [100, 300, 200, 350])).toBeGreaterThan(4000);
    expect(redIn(drawn, [100, 360, 200, 400])).toBe(0);
  });

  it('keeps a PNG’s see-through as a soft mask', async ({ skip }) => {
    const pages = opened(await engine.open(stored));
    const picture = pngOf(8, 4, [220, 20, 20, 0]);
    const result = baked(await bakeCustom(custom(pages[0]!.name), new Map([[KEY, picture]])));
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added).toContain('/SMask');
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
    opened(await engine.open(result.bytes));
    expect(redIn((await engine.drawPage(0, 1))!, [100, 300, 200, 350])).toBe(0);
  });

  it('writes a turned one with Rotate and its appearance turned', async () => {
    const pages = opened(await engine.open(stored));
    const picture = pngOf(8, 4, [220, 20, 20, 255]);
    const result = baked(
      await bakeCustom(custom(pages[0]!.name, { turn: 90 }), new Map([[KEY, picture]])),
    );
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added).toContain('/Rotate 90');
    expect(added).toMatch(/\/Matrix \[0 1 -1 0 /);
  });

  it('refuses the bake by name where its picture was not handed in', async () => {
    const pages = opened(await engine.open(stored));
    expect(await bakeCustom(custom(pages[0]!.name), new Map())).toEqual({
      ok: false,
      refusal: 'pictures-unavailable',
    });
  });

  it('refuses the bake by name where its picture is not the type it says', async () => {
    const pages = opened(await engine.open(stored));
    const notJpeg = pngOf(8, 4, [220, 20, 20, 255]);
    const jpeg = custom(pages[0]!.name, {
      picture: { key: KEY as never, type: 'jpeg', width: 8, height: 4 },
    });
    expect(await bakeCustom(jpeg, new Map([[KEY, notJpeg]]))).toEqual({
      ok: false,
      refusal: 'pictures-unavailable',
    });
  });
});

describe('writing a deletion of the file’s own mark', () => {
  it('removes the marks named, by their own name or by their object, as an addition', async () => {
    const file = marksPdf();
    opened(await engine.open(file));
    const result = await bakeWith([
      PdfChange.removeFromFile('hl-1', 'mark'),
      PdfChange.removeFromFile('o:9', 'mark'),
      PdfChange.removeFromFile('no-such-mark', 'mark'),
      PdfChange.removeFromFile('o:77', 'object'),
    ]);
    expect(result.kind).toBe('addition');
    expect(startsWith(result.bytes, file)).toBe(true);
    opened(await engine.open(result.bytes));
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual([
      're-1',
      'st-1',
      'ca-1',
      'o:10',
      'long',
    ]);
  });
});

// saving.md "What is kept untouched": most software writes a page's list of marks as an object of its own; a change
// to one mark of such a page keeps every other, the file's fields among them.
describe('a page that names its list of marks as an object of its own', () => {
  const OWN = ['hl-1', 're-1', 'st-1', 'ca-1', 'o:9', 'o:10', 'long'];

  it('keeps every mark the file holds there when one is added', async () => {
    const pages = opened(await engine.open(marksPdf(0, true)));
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual(OWN);
    const result = await bakeWith([
      PdfChange.addMark(
        Mark.highlight({
          id: 'added',
          page: pages[0]!.name,
          quads: [[10, 40, 60, 40, 10, 20, 60, 20]],
          text: '',
          colour: '#fdf1a9',
          opacity: 1,
          author: 'Ada',
          createdAt: at,
        })!,
      ),
    ]);
    expect(result.kind).toBe('addition');
    opened(await engine.open(result.bytes));
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual([...OWN, 'added']);
  });

  it('removes a mark from a list that also holds a mark written in place and an entry that is none', async () => {
    const page =
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Annots 4 0 R >>';
    const note = '/Type /Annot /Subtype /Text /Rect [72 700 92 720]';
    opened(
      await engine.open(
        rawPdf([
          '<< /Type /Catalog /Pages 2 0 R >>',
          '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
          page,
          `[5 0 R 7 << ${note} /Contents (In place) >>]`,
          `<< ${note} /NM (named) >>`,
        ]),
      ),
    );
    const result = await bakeWith([PdfChange.removeFromFile('named', 'mark')]);
    opened(await engine.open(result.bytes));
    expect((await engine.fileMarks(0)).map((mark) => mark.words)).toEqual(['In place']);
  });

  it('removes the marks named from it, and no other', async () => {
    opened(await engine.open(marksPdf(0, true)));
    const result = await bakeWith([
      PdfChange.removeFromFile('hl-1', 'mark'),
      PdfChange.removeFromFile('o:9', 'mark'),
    ]);
    opened(await engine.open(result.bytes));
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual([
      're-1',
      'st-1',
      'ca-1',
      'o:10',
      'long',
    ]);
  });
});

// saving.md "Addition or rewrite": pages turned are a rewrite; what Reviewing added is appended to it.
describe('a rewrite', () => {
  it('turns the page in the file, then appends the mark to the page it was made on', async ({
    skip,
  }) => {
    const pages = opened(await engine.open(stored));
    const result = await bakeWith([
      PdfChange.turnPage(pages[1]!.name, 90),
      await highlightOn(0, pages),
      await highlightOn(1, pages, 'mark-2'),
    ]);
    expect(result).toMatchObject({ kind: 'rewrite', anchorsLost: 0 });
    expect(startsWith(result.bytes, stored)).toBe(false);
    const reopened = opened(await engine.open(result.bytes));
    expect(reopened.map((page) => page.rotation)).toEqual([0, 90]);
    expect(reopened.map((page) => [page.width, page.height])).toEqual([
      [612, 792],
      [792, 612],
    ]);
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual(['mark-1']);
    expect((await engine.fileMarks(1)).map((mark) => mark.id)).toEqual(['mark-2']);
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
  });

  it('writes the same stored file and changes to the same bytes', async () => {
    const pages = opened(await engine.open(stored));
    const changes = [PdfChange.turnPage(pages[0]!.name, 180), await highlightOn(1, pages)];
    const first = await bakeWith(changes);
    opened(await engine.open(stored));
    expect((await bakeWith(changes)).bytes).toEqual(first.bytes);
  });

  it('counts a turn of a page the stored file does not hold', async () => {
    opened(await engine.open(stored));
    const result = await bakeWith([PdfChange.turnPage('p:99999', 90)]);
    expect(result).toMatchObject({ kind: 'rewrite', anchorsLost: 1 });
  });

  // opening.md "Damaged files": a repaired file's changes are written as a rewritten file.
  it('rewrites a file that cannot take an addition, with the mark on its page', async ({
    skip,
  }) => {
    const damaged = spoiled(stored);
    const pages = opened(await engine.open(damaged));
    expect(await engine.canAppend()).toBe(false);
    expect(await engine.repaired()).toBe(true);
    const result = await bakeWith([await highlightOn(0, pages)]);
    expect(result.kind).toBe('rewrite');
    opened(await engine.open(result.bytes));
    expect(await engine.canAppend()).toBe(true);
    expect(await engine.repaired()).toBe(false);
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual(['mark-1']);
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
  });

  // saving.md "What is kept untouched"
  it('keeps the outline, page labels, embedded files, PDF layers, fields and marks it did not touch', async () => {
    const turned = async (file: Uint8Array<ArrayBuffer>) => {
      const pages = opened(await engine.open(file));
      const result = await bakeWith([PdfChange.turnPage(pages[0]!.name, 90)]);
      expect(result.kind).toBe('rewrite');
      return result.bytes;
    };
    opened(await engine.open(outlinePdf()));
    const outline = await engine.outline();
    opened(await engine.open(await turned(outlinePdf())));
    expect((await engine.outline()).items.map((item) => item.title)).toEqual(
      outline.items.map((item) => item.title),
    );
    const labels = opened(await engine.open(await turned(labelledPdf()))).map((page) => page.label);
    expect(labels).toEqual(['i', 'ii', 'A-1']);
    opened(await engine.open(embeddedFilesPdf()));
    const files = await engine.embeddedFiles();
    opened(await engine.open(await turned(embeddedFilesPdf())));
    expect(await engine.embeddedFiles()).toEqual(files);
    opened(await engine.open(await turned(layersPdf())));
    expect((await engine.layers()).map((layer) => layer.name)).toEqual(['Plan', 'Notes', 'Border']);
    opened(await engine.open(formPdf()));
    const fields = await engine.fields(0);
    opened(await engine.open(await turned(formPdf())));
    expect((await engine.fields(0)).map((field) => [field.name, field.value])).toEqual(
      fields.map((field) => [field.name, field.value]),
    );
    opened(await engine.open(await turned(marksPdf())));
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toContain('hl-1');
  });

  // saving.md "What is kept untouched": what LiveDoc does not understand is kept and written back.
  it('keeps other software’s private data it does not understand', async ({ skip }) => {
    const pages = opened(await engine.open(privateDataPdf()));
    const result = await bakeWith([PdfChange.turnPage(pages[0]!.name, 90)]);
    expect(result.kind).toBe('rewrite');
    const file = join(mkdtempSync(join(tmpdir(), 'pdf-writing-')), 'private.pdf');
    writeFileSync(file, result.bytes);
    try {
      execFileSync('qpdf', ['--version'], { stdio: 'ignore' });
    } catch {
      skip('qpdf is not installed');
    }
    // The file as plain objects, whatever way the writer packed them.
    const plain = execFileSync('qpdf', ['--qdf', '--object-streams=disable', file, '-'], {
      encoding: 'latin1',
      maxBuffer: 16 * 1024 * 1024,
    });
    expect(plain).toContain('/OtherSoftware');
    expect(plain).toContain('(kept as it came)');
    expect(plain).toMatch(/\/Unknown \/Thing/);
    expect(plain).toMatch(/\/Numbers \[\s*1\s+2\s+3\s*\]/);
  });

  // saving.md "Addition or rewrite": a protected file is rewritten protected.
  it('rewrites a protected file protected, opening with the same password', async ({ skip }) => {
    const locked = await protectedPdf({ userPassword: 'open sesame' });
    await engine.open(locked);
    const pages = opened(await engine.unlock('open sesame'));
    const result = await bakeWith([PdfChange.turnPage(pages[0]!.name, 270)]);
    expect(result.kind).toBe('rewrite');
    expect(await engine.open(result.bytes)).toEqual({ ok: false, needsPassword: true });
    expect(opened(await engine.unlock('open sesame'))[0]!.rotation).toBe(270);
    expect(qpdfChecks(result.bytes, skip, 'open sesame')).toContain(
      'No syntax or stream encoding errors',
    );
  });
});

// saving.md "The validators' claim": an addition keeps every earlier signature valid, by poppler's pdfsig.
describe('an addition to a signed file', () => {
  it('leaves the signature valid over what it signed', async ({ skip }) => {
    const signed = await signedPdf();
    const pages = opened(await engine.open(signed));
    const result = await bakeWith([await highlightOn(0, pages)]);
    expect(result.kind).toBe('addition');
    expect(startsWith(result.bytes, signed)).toBe(true);
    const file = join(mkdtempSync(join(tmpdir(), 'pdf-writing-')), 'signed.pdf');
    writeFileSync(file, result.bytes);
    try {
      execFileSync('pdfsig', ['-v'], { stdio: 'ignore' });
    } catch {
      skip('pdfsig is not installed');
    }
    const said = execFileSync('pdfsig', ['-nocert', file], { encoding: 'utf8' });
    expect(said).toContain('Signature is Valid');
    expect(said).not.toContain('Total document signed');
  });
});

// opening.md "Passwords": a protected file the writer cannot open with its password is read and never written.
describe('a protected file the writer cannot open', () => {
  it('is refused a bake by name, never trapped, and is read as before', async () => {
    const file = corpusFiles().find((held) => held.unwritable)!;
    await engine.open(corpusBytes(file));
    const pages = opened(await engine.unlock(file.password!));
    const doc = PdfLiveChanges.load();
    PdfChangeset.apply(doc, [PdfChange.turnPage(pages[0]!.name, 90)]);
    expect(await engine.bake(PdfLiveChanges.encode(doc))).toEqual({
      ok: false,
      refusal: 'unreadable',
    });
    expect(await engine.canAppend()).toBe(false);
    expect(await engine.layers()).toEqual([]);
    expect((await engine.pageText(0))!.text).toContain('Hello');
  });
});

// opening.md "Damaged files": whether a file can take an addition is the writer's answer.
describe('whether a file can take an addition', () => {
  it('is yes for a whole file, and for a file the writer reads after the reader', async () => {
    opened(await engine.open(stored));
    expect(await engine.canAppend()).toBe(true);
    expect(await engine.layers()).toEqual([]);
    expect(await engine.canAppend()).toBe(true);
  });

  it('is no for a file opened only by rebuilding it, and with no file open', async () => {
    opened(await engine.open(spoiled(stored)));
    expect(await engine.canAppend()).toBe(false);
    await engine.close();
    expect(await engine.canAppend()).toBe(false);
  });
});

// marks.md "Changing a mark": Rotate, In the file. A turned stamp, Text, Rectangle and Ellipse carry `Rotate` their
// angle, their appearance drawn upright and turned by its `Matrix`, `Rect` the box as it shows; read back from
// `Rotate`, else from a `Matrix` that is a turn; a `Matrix` that is no turn reads upright.
describe('writing a turned mark', () => {
  const red = '#d93025';
  const shared = (page: PageName) => ({
    page,
    colour: red,
    opacity: 1,
    author: 'Ada',
    createdAt: at,
    rect: [200, 300, 320, 360] as const,
    turn: 30,
  });
  const kinds = (page: PageName): Record<string, Mark> => ({
    stamp: Mark.stamp({ ...shared(page), id: 'stamp', stamp: 'approved', lines: ['APPROVED'] })!,
    text: Mark.text({ ...shared(page), id: 'text', words: 'Turned words', size: 12 })!,
    rectangle: Mark.shape('rectangle', {
      ...shared(page),
      id: 'rectangle',
      width: 2,
      fill: '#d93025',
    })!,
    ellipse: Mark.shape('ellipse', { ...shared(page), id: 'ellipse', width: 2 })!,
  });
  const redIn = (
    drawn: { width: number; height: number; rgba: Uint8ClampedArray },
    { x, y }: { x: number; y: number },
  ) => {
    const index = ((drawn.height - Math.round(y)) * drawn.width + Math.round(x)) * 4;
    const [r, g, b] = drawn.rgba.slice(index, index + 3);
    return r! > 180 && g! < 110 && b! < 110;
  };
  /** A point of the 30° turn of (200, 300)-(320, 360) about its middle (260, 330). */
  const turned = (x: number, y: number) => {
    const cos = Math.cos(Math.PI / 6);
    const dx = x - 260;
    const dy = y - 330;
    return { x: 260 + cos * dx - 0.5 * dy, y: 330 + 0.5 * dx + cos * dy };
  };

  it.for(['stamp', 'text', 'rectangle', 'ellipse'])(
    'writes a %s turned 30° with Rotate and its Matrix, and reads it back turned',
    async (kind, { skip }) => {
      const pages = opened(await engine.open(stored));
      const mark = kinds(pages[0]!.name)[kind]!;
      const result = await bakeWith([PdfChange.addMark(mark)]);
      const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
      expect(added).toContain('/Rotate 30');
      expect(added).toMatch(/\/Matrix \[0\.866\d* 0\.5 -0\.5 0\.866\d* /);
      expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
      opened(await engine.open(result.bytes));
      const [read] = await engine.fileMarks(0);
      expect(read!.mark).toMatchObject({ kind, turn: 30 });
      const rect = (read!.mark as Mark & { rect: readonly number[] }).rect;
      [200, 300, 320, 360].forEach((n, i) => expect(rect[i]).toBeCloseTo(n, 1));
    },
  );

  it('draws a turned Rectangle where it shows, not where it stood upright', async () => {
    const pages = opened(await engine.open(stored));
    const result = await bakeWith([PdfChange.addMark(kinds(pages[0]!.name).rectangle!)]);
    opened(await engine.open(result.bytes));
    const drawn = (await engine.drawPage(0, 1))!;
    // Just inside the upright box's top-right corner, turned: filled. That corner upright: left bare by the turn.
    expect(redIn(drawn, turned(315, 355))).toBe(true);
    expect(redIn(drawn, { x: 318, y: 302 })).toBe(false);
  });

  it('reads a turn from a Matrix alone, and a Matrix that is no turn as upright', async () => {
    const pages = opened(await engine.open(stored));
    const result = await bakeWith([PdfChange.addMark(kinds(pages[0]!.name).rectangle!)]);
    const text = Buffer.from(result.bytes).toString('latin1');
    // The same length, so every offset holds: `Rotate` renamed away, then the Matrix skewed.
    const matrixOnly = Buffer.from(text.replace('/Rotate 30', '/Rotatx 30'), 'latin1');
    opened(await engine.open(new Uint8Array(matrixOnly)));
    const [fromMatrix] = await engine.fileMarks(0);
    expect(fromMatrix!.mark).toMatchObject({ kind: 'rectangle', turn: 30 });
    const skewed = Buffer.from(
      matrixOnly.toString('latin1').replace(/ 0\.5 -0\.5 /, ' 0.5 -0.1 '),
      'latin1',
    );
    opened(await engine.open(new Uint8Array(skewed)));
    const [fromSkew] = await engine.fileMarks(0);
    expect(fromSkew!.mark).toMatchObject({ kind: 'rectangle' });
    expect(fromSkew!.mark).not.toHaveProperty('turn');
  });
});

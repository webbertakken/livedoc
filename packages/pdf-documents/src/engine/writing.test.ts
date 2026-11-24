import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BakeResult, PdfEngine, PdfOpened } from '../engine-contract';
import { PdfLiveChanges } from '../live-changes';
import { Mark } from '../mark';
import type { PageName } from '../page-name';
import { PdfChange, PdfChangeset } from '../pdf-change';
import { corpusBytes, corpusFiles } from '../testing/corpus';
import {
  embeddedFilesPdf,
  formPdf,
  labelledPdf,
  layersPdf,
  marksPdf,
  outlinePdf,
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
  engine = await createPdfEngine({ wasm: readerWasm() });
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

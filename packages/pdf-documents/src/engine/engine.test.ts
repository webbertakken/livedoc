import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PDF } from '@libpdf/core';
import type { PdfEngine, PdfOpened } from '../engine-contract';
import { PDF_MAX_PAGE_PIXELS, PDF_PROPERTY_MAX_CHARS } from '../limits';
import { PdfLiveChanges } from '../live-changes';
import { Mark } from '../mark';
import { PageView } from '../page-view';
import { PdfPermissions } from '../permissions';
import {
  FIXTURE_LINE,
  fieldsPdf,
  labelledPdf,
  lockedPdf,
  noPagesPdf,
  protectedPdf,
  readerWasm,
  spoiled,
  textPdf,
} from '../testing/fixtures';
import { bakeAddition } from './bake';
import { pdfEngineOver } from './engine';
import { createPdfEngine, pdfDate } from './index';
import { PdfReader, startReader } from './reader';

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
const documentOf = (result: PdfOpened) => {
  if (!result.ok) throw new Error('the fixture did not open');
  return result.document;
};

/** The live changes holding one highlight over the fixture's line on the page given. */
async function changesWithHighlight(pageIndex: number, id = 'mark-1'): Promise<Uint8Array> {
  const pages = opened(await engine.open(stored));
  const selection = await engine.selectText(pageIndex, { x: 74, y: 724 }, { x: 180, y: 724 });
  const mark = Mark.highlight({
    id,
    page: pages[pageIndex]!.name,
    quads: selection!.quads,
    text: selection!.text,
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: Date.UTC(2026, 10, 21, 14, 2, 3),
  })!;
  const doc = PdfLiveChanges.load();
  PdfLiveChanges.addMark(doc, mark);
  return PdfLiveChanges.encode(doc);
}

// opening.md "What is read"
describe('opening', () => {
  it('reads each page with its name and its size as shown', async () => {
    const pages = opened(await engine.open(stored));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ width: 612, height: 792 });
    expect(pages[0]!.name).toMatch(/^p:\d+$/);
    expect(pages[1]!.name).not.toBe(pages[0]!.name);
  });

  it('refuses bytes that are no PDF as damaged', async () => {
    expect(await engine.open(new TextEncoder().encode('not a pdf at all'))).toEqual({
      ok: false,
      refusal: 'pdf_damaged',
    });
    expect(await engine.drawPage(0, 1)).toBeNull();
    expect(await engine.bake(PdfLiveChanges.merge([]))).toEqual({
      ok: false,
      refusal: 'unreadable',
    });
  });

  // opening.md "Refusals"
  it('tells a PDF with no pages from a damaged one', async () => {
    expect(await engine.open(noPagesPdf())).toEqual({ ok: false, refusal: 'pdf_newer' });
  });

  it('names a file locked to certificates, and one locked by another handler', async () => {
    expect(await engine.open(lockedPdf('Adobe.PubSec'))).toEqual({
      ok: false,
      refusal: 'pdf_certificate_protected',
    });
    expect(await engine.open(lockedPdf('Rights.Service'))).toEqual({
      ok: false,
      refusal: 'pdf_rights_protected',
    });
  });

  // security.md "Abuse cases": a parser crash ends the reader, never the page.
  it('answers a trap inside the reader as stopped', async () => {
    const pdfium = await startReader(readerWasm());
    const trapping = new Proxy(pdfium, {
      get: (target, key, receiver) =>
        key === 'FPDF_LoadMemDocument'
          ? () => {
              throw new WebAssembly.RuntimeError('unreachable');
            }
          : (Reflect.get(target, key, receiver) as unknown),
    });
    expect(await pdfEngineOver(trapping).open(stored)).toEqual({
      ok: false,
      refusal: 'pdf_stopped',
    });
  });

  it('asks for a password rather than refusing a file that has one', async () => {
    const locked = await protectedPdf({ userPassword: 'open', ownerPassword: 'owner' });
    expect(await engine.open(locked)).toEqual({ ok: false, needsPassword: true });
  });
});

// opening.md "Passwords"
describe('a protected file', () => {
  it('opens with its password, given to the engine that already holds the file', async () => {
    const locked = await protectedPdf({ userPassword: 'open', ownerPassword: 'owner' });
    expect(await engine.open(locked)).toEqual({ ok: false, needsPassword: true });
    expect(await engine.unlock('not it')).toEqual({ ok: false, needsPassword: true, wrong: true });
    const unlocked = await engine.unlock('open');
    expect(opened(unlocked)).toHaveLength(2);
    expect(documentOf(unlocked).encrypted).toBe(true);
    expect((await engine.drawPage(0, 0.25))?.width).toBe(153);
  });

  it('reads what the permissions ask, and asks nothing once the permissions password is given', async () => {
    const asking = await protectedPdf({
      ownerPassword: 'owner',
      permissions: { modify: false, copy: false, annotate: false, assemble: false },
    });
    const read = documentOf(await engine.open(asking));
    expect(read.encrypted).toBe(true);
    expect(read.permissions).toEqual({
      print: true,
      printSharp: true,
      changeContent: false,
      copy: false,
      mark: false,
      fill: true,
      organise: false,
    });
    // A wrong permissions password leaves the file open, asking what it asked.
    expect(await engine.unlock('not it')).toEqual({ ok: false, needsPassword: true, wrong: true });
    expect((await engine.drawPage(0, 0.25))?.width).toBe(153);
    expect(documentOf(await engine.unlock('owner')).permissions).toEqual(PdfPermissions.all());
  });

  it('writes a mark into a protected file where its password is, and the result opens with it', async () => {
    const locked = await protectedPdf({ userPassword: 'open', ownerPassword: 'owner' });
    await engine.open(locked);
    const pages = opened(await engine.unlock('open'));
    const doc = PdfLiveChanges.load();
    PdfLiveChanges.addMark(
      doc,
      Mark.highlight({
        id: 'mark-1',
        page: pages[0]!.name,
        quads: [[72, 732, 300, 732, 72, 716, 300, 716]],
        text: 'The quick',
        colour: '#fdf1a9',
        opacity: 1,
        author: 'Ada',
        createdAt: Date.UTC(2026, 10, 21, 14, 2, 3),
      })!,
    );
    const baked = await engine.bake(PdfLiveChanges.encode(doc));
    if (!baked.ok) throw new Error(`not baked: ${baked.refusal}`);
    expect(baked.kind).toBe('addition');
    expect(await engine.open(baked.bytes)).toEqual({ ok: false, needsPassword: true });
    opened(await engine.unlock('open'));
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual(['mark-1']);
  });

  it('answers a password given with no file waiting as nothing to open', async () => {
    await engine.close();
    expect(await engine.unlock('open')).toEqual({ ok: false, refusal: 'pdf_damaged' });
  });

  it('bakes nothing while it waits for its password', async () => {
    const locked = await protectedPdf({ userPassword: 'open' });
    await engine.open(locked);
    expect(await engine.bake(PdfLiveChanges.encode(PdfLiveChanges.load()))).toEqual({
      ok: false,
      refusal: 'unreadable',
    });
  });
});

// opening.md "What is read": pages with their labels, the metadata, the form, the structure tree.
describe('what a file says of itself', () => {
  it('reads its version, and asks nothing of a file with no protection', async () => {
    const read = documentOf(await engine.open(stored));
    expect(read.version).toBe('1.7');
    expect(read.encrypted).toBe(false);
    expect(read.permissions).toEqual(PdfPermissions.all());
    expect(read.tagged).toBe(false);
    expect(read.form).toBe('none');
  });

  it('reads its properties as text, each cut to its limit', async () => {
    const pdf = await PDF.load(stored.slice());
    pdf.setTitle('Lease agreement');
    pdf.setAuthor('Ada Lovelace');
    pdf.setSubject('S'.repeat(PDF_PROPERTY_MAX_CHARS + 40));
    pdf.setKeywords(['lease', 'flat']);
    const read = documentOf(await engine.open((await pdf.save()) as Uint8Array<ArrayBuffer>));
    expect(read.properties.title).toBe('Lease agreement');
    expect(read.properties.author).toBe('Ada Lovelace');
    expect(read.properties.subject).toHaveLength(PDF_PROPERTY_MAX_CHARS);
    expect(read.properties.keywords).toContain('lease');
    // A property the file does not name is empty.
    expect(documentOf(await engine.open(labelledPdf())).properties).toMatchObject({
      title: '',
      author: '',
      created: '',
    });
  });

  it('reads a title written in another script', async () => {
    const pdf = await PDF.load(stored.slice());
    pdf.setTitle('Huurovereenkomst 賃貸借 🏠');
    const read = documentOf(await engine.open((await pdf.save()) as Uint8Array<ArrayBuffer>));
    expect(read.properties.title).toBe('Huurovereenkomst 賃貸借 🏠');
  });

  it('gives each page the label its file gives it, and none where the file gives none', async () => {
    expect(opened(await engine.open(stored)).map((page) => page.label)).toEqual([null, null]);
    const labelled = opened(await engine.open(labelledPdf()));
    expect(labelled.map((page) => page.label)).toEqual(['i', 'ii', 'A-1']);
  });

  it('says a file has fields where it holds an interactive form', async () => {
    expect(documentOf(await engine.open(fieldsPdf())).form).toBe('fields');
  });
});

// reading-surface.md "The pages"
describe('drawing', () => {
  it('draws a page at the scale asked, with the matrix that places marks on it', async () => {
    await engine.open(stored);
    const bitmap = (await engine.drawPage(0, 0.5))!;
    expect([bitmap.width, bitmap.height]).toEqual([306, 396]);
    expect(bitmap.rgba).toHaveLength(306 * 396 * 4);
    // Paper is white where nothing is drawn, and the line of text has left ink.
    expect([...bitmap.rgba.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect(bitmap.rgba.some((value, at) => at % 4 === 0 && value < 128)).toBe(true);
    // An upright page: page space's y runs up from the bottom edge.
    expect(PageView.toView(bitmap.toView, { x: 72, y: 720 })).toEqual({ x: 72, y: 72 });
  });

  it('answers nothing for a page that is not there', async () => {
    await engine.open(stored);
    expect(await engine.drawPage(2, 1)).toBeNull();
    expect(await engine.drawPage(-1, 1)).toBeNull();
    expect(await engine.drawPage(0.5, 1)).toBeNull();
  });

  // security.md "Abuse cases": a decompression bomb draws at most PDF_MAX_PAGE_PIXELS.
  it('never draws past the pixel ceiling, whatever scale is asked', async () => {
    const tiny = PDF.create();
    tiny.addPage({ width: 8, height: 8 });
    await engine.open((await tiny.save()) as Uint8Array<ArrayBuffer>);
    const bitmap = (await engine.drawPage(0, 1e9))!;
    expect(bitmap.width * bitmap.height).toBeLessThanOrEqual(PDF_MAX_PAGE_PIXELS);
    const asked = (await engine.drawPage(0, Number.NaN))!;
    expect([asked.width, asked.height]).toEqual([8, 8]);
  });
});

// opening.md "What is read": Text, characters with positions, in the file's own order.
describe("a page's text", () => {
  it('reads the characters in the file’s order, each with its box on the page', async () => {
    opened(await engine.open(stored));
    const page = (await engine.pageText(0))!;
    expect(page.text.startsWith(FIXTURE_LINE)).toBe(true);
    expect(page.text).toContain('Page 1');
    expect(page.boxes).toHaveLength(page.text.length * 4);
    expect(page.cut).toBe(false);
    expect(page.unmapped).toEqual([]);
    // "T", the first character: 72 points in, on the line 720 up, about a 12 point capital.
    const [left, bottom, right, top] = page.boxes.slice(0, 4);
    expect(left).toBeGreaterThanOrEqual(71);
    expect(left).toBeLessThan(74);
    expect(bottom).toBeGreaterThanOrEqual(718);
    expect(top).toBeGreaterThan(726);
    expect(top).toBeLessThan(733);
    expect(right).toBeGreaterThan(left!);
    // Along the line each character starts to the right of the one before.
    const lefts = [...FIXTURE_LINE].map((_, at) => page.boxes[at * 4]!);
    const visible = lefts.filter((_, at) => FIXTURE_LINE[at] !== ' ');
    expect([...visible].sort((a, b) => a - b)).toEqual(visible);
  });

  it('answers nothing for a page that is not there, and no characters for a page with none', async () => {
    opened(await engine.open(stored));
    expect(await engine.pageText(9)).toBeNull();
    opened(await engine.open(labelledPdf()));
    expect(await engine.pageText(0)).toEqual({
      text: '',
      boxes: new Float32Array(0),
      unmapped: [],
      cut: false,
    });
  });

  it('reads only the first part of a page past the limit, and says so', async () => {
    const reader = new PdfReader(await startReader(readerWasm()));
    reader.open(stored);
    const page = reader.pageText(0, 9)!;
    expect(page.text).toBe(FIXTURE_LINE.slice(0, 9));
    expect(page.boxes).toHaveLength(36);
    expect(page.cut).toBe(true);
    reader.close();
  });
});

// marks.md "Kinds": a text mark follows its text
describe('selecting text', () => {
  it('answers the text between two points with the quads of its glyphs', async () => {
    await engine.open(stored);
    const selection = (await engine.selectText(0, { x: 74, y: 724 }, { x: 122, y: 724 }))!;
    expect(FIXTURE_LINE.startsWith(selection.text)).toBe(true);
    expect(selection.text.length).toBeGreaterThan(3);
    expect(selection.quads).toHaveLength(1);
    const [left, top, right, , , bottom] = selection.quads[0]!;
    expect(left).toBeGreaterThan(70);
    expect(right).toBeLessThan(140);
    expect(top).toBeGreaterThan(bottom);
  });

  it('answers the same text whichever point comes first', async () => {
    await engine.open(stored);
    const forward = await engine.selectText(0, { x: 74, y: 724 }, { x: 180, y: 724 });
    const backward = await engine.selectText(0, { x: 180, y: 724 }, { x: 74, y: 724 });
    expect(backward).toEqual(forward);
  });

  it('answers nothing where there is no text, or no such page', async () => {
    await engine.open(stored);
    expect(await engine.selectText(0, { x: 300, y: 300 }, { x: 320, y: 300 })).toBeNull();
    expect(await engine.selectText(0, { x: Number.NaN, y: 724 }, { x: 180, y: 724 })).toBeNull();
    expect(await engine.selectText(9, { x: 74, y: 724 }, { x: 180, y: 724 })).toBeNull();
  });
});

// saving.md
describe('baking', () => {
  it('hands out the stored file itself when nothing was changed', async () => {
    await engine.open(stored);
    const result = await engine.bake(PdfLiveChanges.merge([]));
    expect(result).toMatchObject({ ok: true, kind: 'unchanged' });
    expect(result.ok && result.bytes).toBe(stored);
  });

  it('appends a highlight, keeping the stored file a byte-for-byte prefix', async () => {
    const changes = await changesWithHighlight(1);
    const result = await engine.bake(changes);
    if (!result.ok) throw new Error(result.refusal);
    expect(result.kind).toBe('addition');
    expect(result.anchorsLost).toBe(0);
    expect(result.bytes.length).toBeGreaterThan(stored.length);
    expect(result.bytes.length - stored.length).toBeLessThan(2_000);
    expect(Buffer.compare(result.bytes.subarray(0, stored.length), stored)).toBe(0);
  });

  it('bakes the same stored file and changes to the same bytes', async () => {
    const changes = await changesWithHighlight(0);
    const first = await engine.bake(changes);
    const second = await engine.bake(changes);
    if (!first.ok || !second.ok) throw new Error('bake refused');
    expect(Buffer.compare(first.bytes, second.bytes)).toBe(0);
  });

  it('is read back with the highlight on its page, under its own id, and none on the other', async () => {
    const changes = await changesWithHighlight(1, 'mark-on-two');
    const result = await engine.bake(changes);
    if (!result.ok) throw new Error(result.refusal);
    const pages = opened(await engine.open(result.bytes));
    expect(pages).toHaveLength(2);
    expect(await engine.fileMarks(0)).toEqual([]);
    const [mark] = await engine.fileMarks(1);
    expect(mark).toMatchObject({ id: 'mark-on-two', subtype: 'highlight' });
    expect(mark!.quads).toHaveLength(1);
    expect(await engine.fileMarks(7)).toEqual([]);
  });

  it('writes the author, the colour and the times the mark holds', async () => {
    const result = await engine.bake(await changesWithHighlight(0));
    if (!result.ok) throw new Error(result.refusal);
    const [annotation] = (await PDF.load(result.bytes.slice())).getPages()[0]!.getAnnotations();
    expect(annotation!.name).toBe('mark-1');
    expect(annotation!.modificationDate).toBe('D:20261121140203Z');
    expect(annotation!.dict.getString('CreationDate')?.asString()).toBe('D:20261121140203Z');
    expect(annotation!.dict.getString('T')?.asString()).toBe('Ada');
  });

  it('counts a mark whose page the stored file does not hold, and writes the rest', async () => {
    const pages = opened(await engine.open(stored));
    const doc = PdfLiveChanges.load([await changesWithHighlight(0)]);
    const [kept] = PdfLiveChanges.marks(doc);
    PdfLiveChanges.addMark(doc, { ...kept!, id: 'gone', page: 'p:99999' });
    PdfLiveChanges.addMark(doc, { ...kept!, id: 'inserted', page: 'n:fresh' });
    const result = await engine.bake(PdfLiveChanges.encode(doc));
    expect(result).toMatchObject({ ok: true, kind: 'addition', anchorsLost: 2 });
    expect(pages).toHaveLength(2);
  });

  // saving.md "Addition or rewrite": the writer is asked first; a silent fall back to a rewrite is a defect.
  it('refuses to append to a file opened only by rebuilding its cross-reference', async () => {
    const changes = await changesWithHighlight(0);
    const broken = spoiled(stored);
    opened(await engine.open(broken));
    expect(await engine.bake(changes)).toEqual({ ok: false, refusal: 'cannot-append' });
    expect(await bakeAddition(new TextEncoder().encode('no pdf'), [])).toMatchObject({ ok: false });
  });

  // saving.md "The validators' claim": a bake that fails its reopen check is not handed out.
  it('hands out nothing when the written file does not reopen with its pages', async () => {
    const pdfium = await startReader(readerWasm());
    const changes = await changesWithHighlight(0);
    const onePage = await textPdf(1);
    const wrongPages = pdfEngineOver(pdfium, async () => ({
      ok: true,
      bytes: onePage,
      anchorsLost: 0,
    }));
    await wrongPages.open(stored);
    expect(await wrongPages.bake(changes)).toEqual({ ok: false, refusal: 'reopen' });
    const garbage = pdfEngineOver(pdfium, async () => ({
      ok: true,
      bytes: new Uint8Array([1, 2, 3]),
      anchorsLost: 0,
    }));
    await garbage.open(stored);
    expect(await garbage.bake(changes)).toEqual({ ok: false, refusal: 'reopen' });
  });

  it('refuses changes that are no update, and a bake with no file open', async () => {
    await engine.open(stored);
    expect(await engine.bake(new Uint8Array([9, 9, 9, 9]))).toEqual({
      ok: false,
      refusal: 'unreadable',
    });
    await engine.close();
    expect(await engine.bake(PdfLiveChanges.merge([]))).toEqual({
      ok: false,
      refusal: 'unreadable',
    });
  });

  // saving.md "The validators' claim": every baked file passes qpdf --check, where the tool is installed.
  it('passes qpdf --check', async ({ skip }) => {
    try {
      execFileSync('qpdf', ['--version'], { stdio: 'ignore' });
    } catch {
      skip("qpdf is not installed here; CI's office job runs it");
    }
    const result = await engine.bake(await changesWithHighlight(0));
    if (!result.ok) throw new Error(result.refusal);
    const file = join(mkdtempSync(join(tmpdir(), 'pdf-bake-')), 'baked.pdf');
    writeFileSync(file, result.bytes);
    expect(() => execFileSync('qpdf', ['--check', file], { stdio: 'pipe' })).not.toThrow();
  });
});

describe('pdfDate', () => {
  it('writes a time as the file holds a date, in UTC', () => {
    expect(pdfDate(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe('D:20260102030405Z');
  });
});

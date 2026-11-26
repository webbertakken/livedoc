import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PDF } from '@libpdf/core';
import type { PdfEngine, PdfOpened } from '../engine-contract';
import { PDF_MAX_TREE_DEPTH, PDF_PROPERTY_MAX_CHARS } from '../limits';
import { PdfLiveChanges } from '../live-changes';
import { Mark } from '../mark';
import { PageView } from '../page-view';
import { PdfPermissions } from '../permissions';
import {
  FIXTURE_LINE,
  actionsPdf,
  circularOutlinePdf,
  drawnFieldPdf,
  deepOutlinePdf,
  fieldsPdf,
  labelledPdf,
  layeredDrawingPdf,
  linksPdf,
  longOutlinePdf,
  outlinePdf,
  lockedPdf,
  noPagesPdf,
  protectedPdf,
  readerWasm,
  rotatedPdf,
  spoiled,
  textPdf,
  xfaPdf,
} from '../testing/fixtures';
import { bakeChanges } from './bake';
import { pdfEngineOver } from './engine';
import { createPdfEngine } from './index';
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
  it('reads how far each page is turned, and its size as it shows turned', async () => {
    const pages = opened(await engine.open(rotatedPdf()));
    expect(pages.map((page) => page.rotation)).toEqual([90, 180, 270, 0, 0]);
    expect(pages.map((page) => [page.width, page.height])).toEqual([
      [792, 612],
      [612, 792],
      [792, 612],
      [612, 792],
      [612, 792],
    ]);
  });

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

  it('says a file has fields where it holds an interactive form, and when that form is an XFA form', async () => {
    expect(documentOf(await engine.open(fieldsPdf())).form).toBe('fields');
    expect(documentOf(await engine.open(xfaPdf())).form).toBe('xfa');
  });
});

// reading-surface.md "Layers": a page drawn with a person's layers, from a copy; the file as it was for everyone else.
describe("drawing with a person's layers", () => {
  // The middle of each square at a scale of 0.5: "Plan" at (122, 122) points, "Notes" at (350, 350).
  const red = (bitmap: { rgba: Uint8ClampedArray; width: number }, x: number, y: number) => [
    ...bitmap.rgba.slice((y * bitmap.width + x) * 4, (y * bitmap.width + x) * 4 + 3),
  ];
  const plan = (bitmap: Parameters<typeof red>[0]) => red(bitmap, 61, 335);
  const notes = (bitmap: Parameters<typeof red>[0]) => red(bitmap, 175, 221);
  const WHITE = [255, 255, 255];

  it('draws the layers as the file sets them unless asked otherwise', async () => {
    await engine.open(layeredDrawingPdf());
    const asFile = (await engine.drawPage(0, 0.5))!;
    expect(plan(asFile)).toEqual([0, 0, 0]);
    expect(notes(asFile)).toEqual(WHITE);
  });

  it('draws the layers a person shows and hides, and leaves the stored file as it was', async () => {
    const bytes = layeredDrawingPdf();
    await engine.open(bytes.slice());
    const [planLayer, notesLayer] = await engine.layers();
    const allShown = (await engine.drawPage(0, 0.5, 0, []))!;
    expect(plan(allShown)).toEqual([0, 0, 0]);
    expect(notes(allShown)).toEqual([255, 0, 0]);
    const planHidden = (await engine.drawPage(0, 0.5, 0, [planLayer!.id, notesLayer!.id]))!;
    expect(plan(planHidden)).toEqual(WHITE);
    expect(notes(planHidden)).toEqual(WHITE);
    const tile = (await engine.drawTile(0, 0.5, 0, { x: 0, y: 0, width: 306, height: 396 }, []))!;
    expect(notes(tile)).toEqual([255, 0, 0]);
    // Everyone else, and the file itself: as the file sets them.
    expect(notes((await engine.drawPage(0, 0.5))!)).toEqual(WHITE);
    const baked = await engine.bake(PdfLiveChanges.merge([]));
    expect(baked.ok && baked.bytes).toEqual(bytes);
  });

  it("says whether a person's layers can be drawn, and logs the copy made", async () => {
    const lines: string[] = [];
    const logged = pdfEngineOver(await startReader(readerWasm()), undefined, (line) =>
      lines.push(line),
    );
    await logged.open(layeredDrawingPdf());
    const [planLayer] = await logged.layers();
    expect(await logged.layerView([planLayer!.id])).toBe(true);
    expect(await logged.layerView([planLayer!.id])).toBe(true);
    expect(lines.filter((line) => line.startsWith('[pdf] layer-view'))).toEqual([
      '[pdf] layer-view hidden=1',
    ]);
    await logged.open(stored);
    expect(await logged.layerView([])).toBe(false);
    await logged.close();
  });

  it('draws a file with no layers as it is, whatever is asked', async () => {
    await engine.open(stored);
    expect((await engine.drawPage(0, 0.5, 0, ['o:4']))?.width).toBe(306);
  });
});

// reading-surface.md "The pages"
describe('drawing', () => {
  // reading-surface.md "Following a link": a place on a page not yet drawn is reckoned with the page's matrix.
  it('answers the matrix a page is drawn with, turned or not, without drawing it', async () => {
    await engine.open(stored);
    const drawn = (await engine.drawPage(0, 0.5, 1))!;
    expect(await engine.pageMatrix(0, 1)).toEqual(drawn.toView);
    expect(PageView.toView((await engine.pageMatrix(0))!, { x: 72, y: 720 })).toEqual({
      x: 72,
      y: 72,
    });
    expect(await engine.pageMatrix(9)).toBeNull();
  });

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

  // reading-surface.md "The pages": Rotate view turns every page a quarter, drawn turned by the engine, so a mark
  // placed by the matrix meets the page where the turned picture shows it.
  it('draws a page turned by quarters, with the matrix that places marks on the turned picture', async () => {
    await engine.open(stored);
    const upright = (await engine.drawPage(0, 0.5, 0))!;
    const clockwise = (await engine.drawPage(0, 0.5, 1))!;
    const upsideDown = (await engine.drawPage(0, 0.5, 2))!;
    const counterclockwise = (await engine.drawPage(0, 0.5, 3))!;
    expect([clockwise.width, clockwise.height]).toEqual([396, 306]);
    expect([upsideDown.width, upsideDown.height]).toEqual([306, 396]);
    expect([counterclockwise.width, counterclockwise.height]).toEqual([396, 306]);
    // The line of text, 72 in and 72 down an upright page of 612 by 792 points.
    const line = { x: 72, y: 720 };
    expect(PageView.toView(upright.toView, line)).toEqual({ x: 72, y: 72 });
    expect(PageView.toView(clockwise.toView, line)).toEqual({ x: 792 - 72, y: 72 });
    expect(PageView.toView(upsideDown.toView, line)).toEqual({ x: 612 - 72, y: 792 - 72 });
    expect(PageView.toView(counterclockwise.toView, line)).toEqual({ x: 72, y: 612 - 72 });
    // The ink is where the matrix says: a pixel of the turned picture near the line's start is dark.
    const inkNear = (bitmap: typeof clockwise, at: { x: number; y: number }) => {
      for (let dy = -6; dy <= 6; dy += 1)
        for (let dx = -6; dx <= 6; dx += 1) {
          const x = Math.round(at.x / 2) + dx;
          const y = Math.round(at.y / 2) + dy;
          if (bitmap.rgba[(y * bitmap.width + x) * 4]! < 128) return true;
        }
      return false;
    };
    const start = { x: 80, y: 716 };
    for (const bitmap of [upright, clockwise, upsideDown, counterclockwise])
      expect(inkNear(bitmap, PageView.toView(bitmap.toView, start))).toBe(true);
  });

  // reading-surface.md "The pages": a tile is the same pixels as the whole page drawn at its scale and turn.
  it("draws a tile as the same part of the whole page, turned too, cut at the page's edge", async () => {
    await engine.open(stored);
    // Over the start of the line of text: upright, and down the right of the page turned clockwise.
    for (const [turns, rect] of [
      [0, { x: 40, y: 50, width: 96, height: 64 }],
      [1, { x: 690, y: 40, width: 64, height: 96 }],
    ] as const) {
      const whole = (await engine.drawPage(0, 1, turns))!;
      const tile = (await engine.drawTile(0, 1, turns, rect))!;
      expect([tile.width, tile.height]).toEqual([rect.width, rect.height]);
      expect(tile.toView).toEqual(whole.toView);
      let differing = 0;
      for (let row = 0; row < rect.height; row += 1)
        for (let column = 0; column < rect.width * 4; column += 1) {
          const inWhole = whole.rgba[((rect.y + row) * whole.width + rect.x) * 4 + column]!;
          if (Math.abs(inWhole - tile.rgba[row * rect.width * 4 + column]!) > 8) differing += 1;
        }
      expect(differing).toBe(0);
      // The line of text is in the tile where it is in the whole page: some ink.
      expect(tile.rgba.some((value, at) => at % 4 === 0 && value < 128)).toBe(true);
    }
    // Cut at the page's edge: a US Letter page at 1 is 612 by 792 pixels.
    const edge = (await engine.drawTile(0, 1, 0, { x: 600, y: 780, width: 64, height: 64 }))!;
    expect([edge.width, edge.height]).toEqual([12, 12]);
    expect(await engine.drawTile(0, 1, 0, { x: 700, y: 0, width: 64, height: 64 })).toBeNull();
    expect(await engine.drawTile(9, 1, 0, { x: 0, y: 0, width: 64, height: 64 })).toBeNull();
    expect(
      await engine.drawTile(0, Number.NaN, 0, { x: 0, y: 0, width: 64, height: 64 }),
    ).toBeNull();
    // A tile of a page at 6400% on a sharp screen draws the tile, never the page.
    expect(
      (await engine.drawTile(0, 128, 0, { x: 9000, y: 9000, width: 1024, height: 1024 }))!.width,
    ).toBe(1024);
  });

  // fields.md "What a file's fields are": a field shows as the file drew it, on the page, before anyone fills it.
  it("draws a file's fields as the file drew them", async () => {
    await engine.open(drawnFieldPdf());
    const bitmap = (await engine.drawPage(0, 1))!;
    const inTheField = PageView.toView(bitmap.toView, { x: 172, y: 710 });
    const at = (inTheField.y * bitmap.width + inTheField.x) * 4;
    expect([...bitmap.rgba.slice(at, at + 4)]).toEqual([0, 0, 0, 255]);
    // And nothing of the form is left on the paper beside it.
    expect([...bitmap.rgba.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });

  it('answers nothing for a page that is not there', async () => {
    await engine.open(stored);
    expect(await engine.drawPage(2, 1)).toBeNull();
    expect(await engine.drawPage(-1, 1)).toBeNull();
    expect(await engine.drawPage(0.5, 1)).toBeNull();
  });

  // The size a page is drawn at, its ceiling with it, is drawnSize's (draw-page.test.ts).
  it('draws at the page’s own size when the scale asked is no size', async () => {
    const tiny = PDF.create();
    tiny.addPage({ width: 8, height: 8 });
    await engine.open((await tiny.save()) as Uint8Array<ArrayBuffer>);
    const asked = (await engine.drawPage(0, Number.NaN))!;
    expect([asked.width, asked.height]).toEqual([8, 8]);
  });
});

// opening.md "What is read": the outline; security.md "Links and actions", "Abuse cases" (circular structure).
describe('the outline', () => {
  it('reads the bookmarks nested as the file has them, each with where it leads', async () => {
    const pages = opened(await engine.open(outlinePdf()));
    expect(await engine.outline()).toEqual({
      cut: false,
      items: [
        {
          title: 'Chapter 1',
          depth: 0,
          target: { kind: 'place', page: pages[0]!.name, x: 72, y: 720 },
        },
        {
          title: 'Section 1.1',
          depth: 1,
          target: { kind: 'place', page: pages[1]!.name, x: null, y: null },
        },
        {
          title: 'Website',
          depth: 0,
          target: { kind: 'address', address: 'https://example.com/a' },
        },
        { title: 'Run it', depth: 0, target: { kind: 'action', action: 'launch' } },
        { title: 'Elsewhere', depth: 0, target: { kind: 'file', path: 'other.pdf' } },
      ],
    });
  });

  it('names every other action and performs none; a bookmark that leads nowhere keeps its title', async () => {
    const pages = opened(await engine.open(actionsPdf()));
    expect((await engine.outline()).items.map((item) => [item.title, item.target])).toEqual([
      ['Go to', { kind: 'place', page: pages[0]!.name, x: 5, y: 6 }],
      ['Go nowhere', null],
      ['Script', { kind: 'action', action: 'other' }],
      ['Embedded', { kind: 'action', action: 'embedded-file' }],
      ['Nothing', null],
      ['Missing page', null],
      ['Empty address', { kind: 'refused', reason: 'link_scheme_refused', address: '' }],
    ]);
    // A link that leads nowhere is no link.
    expect(await engine.links(0)).toEqual([]);
    // A mark the file gives no name is named by its object.
    expect(await engine.fileMarks(0)).toMatchObject([
      { id: 'o:13', subtype: 'highlight', quads: [[72, 720, 172, 720, 72, 700, 172, 700]] },
    ]);
  });

  it('reads an outline no deeper than the depth limit', async () => {
    opened(await engine.open(deepOutlinePdf(PDF_MAX_TREE_DEPTH + 4)));
    const outline = await engine.outline();
    expect(outline.items).toHaveLength(PDF_MAX_TREE_DEPTH);
    expect(outline.items.at(-1)).toMatchObject({ depth: PDF_MAX_TREE_DEPTH - 1 });
  });

  it('answers no bookmarks for a file with no outline, or with no file open', async () => {
    opened(await engine.open(stored));
    expect(await engine.outline()).toEqual({ items: [], cut: false });
    await engine.close();
    expect(await engine.outline()).toEqual({ items: [], cut: false });
  });

  it('stops a walk that comes round to a bookmark it has read, and shows what it read', async () => {
    opened(await engine.open(circularOutlinePdf()));
    const outline = await engine.outline();
    expect(outline.items.map((item) => [item.title, item.depth])).toEqual([
      ['One', 0],
      ['Two', 0],
    ]);
  });

  it('cuts an outline past the limit, and says so', async () => {
    const reader = new PdfReader(await startReader(readerWasm()));
    reader.open(longOutlinePdf(12));
    expect(reader.outline(12)).toMatchObject({ cut: false });
    const outline = reader.outline(5);
    expect(outline.items.map((item) => item.title)).toEqual([
      'Bookmark 1',
      'Bookmark 2',
      'Bookmark 3',
      'Bookmark 4',
      'Bookmark 5',
    ]);
    expect(outline.cut).toBe(true);
    reader.close();
  });
});

describe("a page's links", () => {
  it('reads each link with its box and where it leads, following none', async () => {
    const pages = opened(await engine.open(linksPdf()));
    expect(await engine.links(0)).toEqual([
      { rect: [72, 700, 172, 720], target: { kind: 'place', page: pages[1]!.name, x: 10, y: 20 } },
      { rect: [72, 660, 172, 680], target: { kind: 'address', address: 'https://example.com/a' } },
      {
        rect: [72, 620, 172, 640],
        target: { kind: 'refused', reason: 'link_scheme_refused', address: 'javascript:alert(1)' },
      },
      { rect: [72, 580, 172, 600], target: { kind: 'file', path: 'other.pdf' } },
      { rect: [72, 540, 172, 560], target: { kind: 'action', action: 'launch' } },
    ]);
  });

  it('answers no links for a page with none, or a page that is not there', async () => {
    opened(await engine.open(linksPdf()));
    expect(await engine.links(1)).toEqual([]);
    expect(await engine.links(9)).toEqual([]);
  });

  it('reads no more links on a page than the limit', async () => {
    const reader = new PdfReader(await startReader(readerWasm()));
    reader.open(linksPdf());
    expect(reader.links(0, 2)).toHaveLength(2);
    reader.close();
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
      marked: null,
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

  // marks.md "In the file": a group is written as the standard's own, and read back as one group.
  it('writes a group as marks answering its head, grouped, and reads it back as one group', async () => {
    opened(await engine.open(stored));
    const doc = PdfLiveChanges.load([await changesWithHighlight(0)]);
    const [kept] = PdfLiveChanges.marks(doc);
    PdfLiveChanges.addMark(doc, { ...kept!, id: 'g-a', group: 'fresh-group' });
    PdfLiveChanges.addMark(doc, { ...kept!, id: 'g-b', group: 'fresh-group' });
    PdfLiveChanges.addMark(doc, { ...kept!, id: 'lone', group: 'alone' });
    const result = await engine.bake(PdfLiveChanges.encode(doc));
    if (!result.ok) throw new Error(result.refusal);
    const written = (await PDF.load(result.bytes.slice())).getPages()[0]!.getAnnotations();
    const named = new Map(written.map((annotation) => [annotation.name, annotation]));
    const head = named.get('g-a')!;
    expect(head.dict.get('IRT')).toBeUndefined();
    expect(named.get('g-b')!.dict.get('IRT')).toEqual(head.ref);
    expect(named.get('g-b')!.dict.getName('RT')?.value).toBe('Group');
    expect(named.get('lone')!.dict.get('IRT')).toBeUndefined();
    opened(await engine.open(result.bytes));
    const read = new Map((await engine.fileMarks(0)).map((mark) => [mark.id, mark.mark?.group]));
    expect([read.get('g-a'), read.get('g-b'), read.get('lone'), read.get('mark-1')]).toEqual([
      'g-a',
      'g-a',
      undefined,
      undefined,
    ]);
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

  // saving.md "Addition or rewrite": the writer is asked first; a file that cannot take an addition is rewritten.
  it('never appends to a file opened only by rebuilding its cross-reference', async () => {
    const changes = await changesWithHighlight(0);
    const broken = spoiled(stored);
    opened(await engine.open(broken));
    expect(await engine.bake(changes)).toMatchObject({ ok: true, kind: 'rewrite' });
    const nothing = { marks: [], fieldValues: [], removed: new Map(), turns: new Map() };
    expect(await bakeChanges(new TextEncoder().encode('no pdf'), nothing)).toMatchObject({
      ok: false,
    });
  });

  // saving.md "The validators' claim": a bake that fails its reopen check is not handed out.
  it('hands out nothing when the written file does not reopen with its pages', async () => {
    const pdfium = await startReader(readerWasm());
    const changes = await changesWithHighlight(0);
    const onePage = await textPdf(1);
    const wrongPages = pdfEngineOver(pdfium, async () => ({
      ok: true,
      bytes: onePage,
      kind: 'addition',
      anchorsLost: 0,
      fieldsLost: 0,
      glyphsMissing: 0,
    }));
    await wrongPages.open(stored);
    expect(await wrongPages.bake(changes)).toEqual({ ok: false, refusal: 'reopen' });
    const garbage = pdfEngineOver(pdfium, async () => ({
      ok: true,
      bytes: new Uint8Array([1, 2, 3]),
      kind: 'addition',
      anchorsLost: 0,
      fieldsLost: 0,
      glyphsMissing: 0,
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

// docs/specs/035-pdf-documents/security.md "Abuse cases": one test a row the engine itself meets, each named as its
// row is, with the rejection or the outcome the row names. The rows the engine's worker meets (a hang, a memory
// ceiling, a password in a log) are tests of the page's side of it, in apps/live; the rows of signing, redaction and
// the servers are tests of the phases that build them.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfEngine, PdfOpened } from '../engine-contract';
import { PDF_MAX_COORDINATE, PDF_MAX_PAGE_PIXELS, PDF_MAX_TREE_DEPTH } from '../limits';
import { LinkTarget } from '../link-target';
import { PdfLiveChanges } from '../live-changes';
import {
  circularOutlinePdf,
  embeddedFilesPdf,
  linksPdf,
  marksPdf,
  protectedPdf,
  readerWasm,
  textPdf,
} from '../testing/fixtures';
import {
  bombPdf,
  brokenPicturePdf,
  circularFieldPdf,
  circularPagesPdf,
  REMOTE_ADDRESS,
  remotePdf,
  SCRIPT_WOULD_WRITE,
  scriptsPdf,
} from '../testing/hostile';
import { pdfEngineOver } from './engine';
import { createPdfEngine } from './index';
import { PdfReader, startReader } from './reader';

let engine: PdfEngine;
// Every line the engine has logged since the test began.
let logged: string[] = [];

beforeAll(async () => {
  engine = await createPdfEngine({ wasm: readerWasm(), log: (line) => logged.push(line) });
});

beforeEach(() => {
  logged = [];
});

const pagesOf = (opened: PdfOpened) => {
  if (!opened.ok) throw new Error('the file did not open');
  return opened;
};

describe('abuse cases', () => {
  describe('JavaScript anywhere in the file', () => {
    it('is never run: a field keeps its value through every script that would change it', async () => {
      pagesOf(await engine.open(scriptsPdf()));
      const [city] = await engine.fields(0);
      expect(city!.value).toBe('Delft');
      await engine.drawPage(0, 0.25);
      expect((await engine.fields(0))[0]!.value).not.toContain(SCRIPT_WOULD_WRITE);
    });

    it('is counted as the file opens, and logged', async () => {
      expect(pagesOf(await engine.open(scriptsPdf())).document.scripts).toBe(2);
      expect(logged).toContain('[pdf] script-ignored count=2');
      expect(pagesOf(await engine.open(await textPdf(1))).document.scripts).toBe(0);
      expect(logged.filter((line) => line.includes('script-ignored'))).toHaveLength(1);
    });

    it('has no way in: the engine never asks its reader to perform an action', () => {
      const folder = fileURLToPath(new URL('.', import.meta.url));
      const performing = readdirSync(folder)
        .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
        .filter((name) =>
          /FORM_Do\w+Action|FORM_ForceToKillFocus/.test(readFileSync(folder + name, 'utf8')),
        );
      expect(performing).toEqual([]);
    });
  });

  it('launch, submit, import, media: each is read as what it is, and none is followed', async () => {
    pagesOf(await engine.open(linksPdf()));
    const targets = (await engine.links(0)).map((link) => link.target);
    expect(targets.at(-1)).toEqual({ kind: 'action', action: 'launch' });
    expect(targets.filter(LinkTarget.follows).map((target) => target.kind)).toEqual([
      'place',
      'address',
    ]);
  });

  it('a hostile link scheme is refused by name', async () => {
    pagesOf(await engine.open(linksPdf()));
    expect((await engine.links(0))[2]!.target).toEqual({
      kind: 'refused',
      reason: 'link_scheme_refused',
      address: 'javascript:alert(1)',
    });
  });

  describe('remote references', () => {
    const asked = vi.fn(() => {
      throw new Error('the engine asked the network');
    });

    beforeEach(() => {
      asked.mockClear();
      vi.stubGlobal('fetch', asked);
      vi.stubGlobal('XMLHttpRequest', asked);
      vi.stubGlobal('WebSocket', asked);
      vi.stubGlobal('EventSource', asked);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('are drawn as absent: the engine asks the network for nothing', async () => {
      const file = remotePdf();
      expect(Buffer.from(file).toString('latin1')).toContain(REMOTE_ADDRESS);
      const opened = pagesOf(await engine.open(file));
      const drawn = await engine.drawPage(0, 0.5);
      expect([drawn!.width, drawn!.height]).toEqual([306, 396]);
      await engine.pageText(0);
      await engine.layers();
      await engine.bake(PdfLiveChanges.merge([]));
      expect(opened.pages).toHaveLength(1);
      expect(asked).not.toHaveBeenCalled();
    });
  });

  describe('a decompression bomb', () => {
    it('is decoded a row at a time: a picture of 16 MiB in a file of 34 KB draws, the memory as it was', async () => {
      const side = 4096;
      const file = bombPdf(side);
      expect(file.length).toBeLessThan((side * side) / 400);
      pagesOf(await engine.open(file));
      const before = await engine.heldBytes();
      const drawn = await engine.drawPage(0, 0.25);
      expect(drawn!.rgba.slice(0, 3)).toEqual(new Uint8ClampedArray([0, 0, 0]));
      expect((await engine.heldBytes()) - before).toBeLessThan((side * side) / 2);
    });

    // The picture a draw makes holds to the ceiling it is given; that the ceiling is PDF_MAX_PAGE_PIXELS whatever is
    // asked is the size's own test (draw-page.test.ts), which draws no gibibyte to prove it.
    it('draws at most the pixel ceiling, whatever scale is asked', async () => {
      const reader = new PdfReader(await startReader(readerWasm()));
      pagesOf(reader.open(bombPdf(8)));
      const ceiling = 65_536;
      const drawn = reader.drawPage(0, 1e6, ceiling)!;
      expect(drawn.width * drawn.height).toBeLessThanOrEqual(ceiling);
      expect(drawn.rgba).toHaveLength(drawn.width * drawn.height * 4);
      expect(PDF_MAX_PAGE_PIXELS).toBeGreaterThan(ceiling);
    });
  });

  it('a parser crash is answered as stopped, and the next file is read', async () => {
    const pdfium = await startReader(readerWasm());
    let trap = true;
    const trapping = new Proxy(pdfium, {
      get: (target, key, receiver) =>
        key === 'FPDF_LoadMemDocument' && trap
          ? () => {
              throw new WebAssembly.RuntimeError('unreachable');
            }
          : (Reflect.get(target, key, receiver) as unknown),
    });
    const stopping = pdfEngineOver(trapping);
    expect(await stopping.open(await textPdf(1))).toEqual({ ok: false, refusal: 'pdf_stopped' });
    trap = false;
    expect((await stopping.open(await textPdf(1))).ok).toBe(true);
  });

  describe('circular structure', () => {
    it('an outline that leads back into itself is read once', async () => {
      pagesOf(await engine.open(circularOutlinePdf()));
      const { items } = await engine.outline();
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(PDF_MAX_TREE_DEPTH);
    });

    it('a page tree that names itself opens with the pages it has', async () => {
      expect(pagesOf(await engine.open(circularPagesPdf())).pages.length).toBeLessThanOrEqual(2);
      expect((await engine.drawPage(0, 0.25))!.width).toBe(153);
    });

    it('a field that is its own parent is read with a name that ends', async () => {
      pagesOf(await engine.open(circularFieldPdf()));
      const fields = await engine.fields(0);
      expect(fields).toHaveLength(1);
      expect(fields[0]!.value).toBe('kept');
    });
  });

  it('font and image decoders: a picture that fails draws as absent, its page still shows', async () => {
    pagesOf(await engine.open(brokenPicturePdf()));
    const drawn = (await engine.drawPage(0, 0.5))!;
    expect([drawn.width, drawn.height]).toEqual([306, 396]);
    expect(drawn.rgba.every((value) => value === 255)).toBe(true);
  });

  it('a dangerous embedded file is told apart, and none is opened', async () => {
    pagesOf(await engine.open(embeddedFilesPdf()));
    const { files } = await engine.embeddedFiles();
    expect(files.map((file) => [file.name, file.runs])).toEqual([
      ['notes.txt', false],
      ['..run.exe', true],
    ]);
    // Listed by what the PDF says of each: nothing of a file's own bytes crosses.
    expect(Object.keys(files[0]!).toSorted()).toEqual([
      'description',
      'name',
      'runs',
      'size',
      'type',
    ]);
  });

  it('a password is held by the engine alone: no log carries it, and it is gone when the file closes', async () => {
    const password = 'correct horse battery staple';
    const file = await protectedPdf({ userPassword: password });
    expect(await engine.open(file)).toEqual({ ok: false, needsPassword: true });
    expect(await engine.unlock('a wrong guess')).toMatchObject({ ok: false, wrong: true });
    pagesOf(await engine.unlock(password));
    await engine.bake(PdfLiveChanges.merge([]));
    await engine.close();
    expect(logged.join('\n')).not.toContain(password);
    expect(logged.join('\n')).not.toContain('a wrong guess');
    // Nothing is held to open with: the engine has neither the file nor its password.
    expect(await engine.unlock(password)).toEqual({ ok: false, refusal: 'pdf_damaged' });
  });

  it('a comment claiming a LiveDoc person wrote it is a name as text, and names no account', async () => {
    pagesOf(await engine.open(marksPdf()));
    const [mark] = await engine.fileMarks(0);
    expect(mark!.author).toBe('Grace');
    expect(Object.keys(mark!).filter((key) => /account|user|owner|by$/i.test(key))).toEqual([]);
  });

  it('a mark with hostile geometry or text is clamped, and the clamping logged', async () => {
    pagesOf(await engine.open(marksPdf(20_000)));
    const marks = await engine.fileMarks(0);
    const wide = marks.find((mark) => mark.rect[2] === PDF_MAX_COORDINATE)!;
    expect(wide.rect).toEqual([-PDF_MAX_COORDINATE, 5, PDF_MAX_COORDINATE, 20]);
    expect(marks.at(-1)!.words).toHaveLength(10_000);
    expect(logged).toContain('[pdf] value-clamped what=coordinate count=2');
    expect(logged).toContain('[pdf] value-clamped what=text count=1');
    // A read that clamps nothing logs nothing.
    logged = [];
    pagesOf(await engine.open(await textPdf(1)));
    await engine.fileMarks(0);
    expect(logged).toEqual([]);
  });
});

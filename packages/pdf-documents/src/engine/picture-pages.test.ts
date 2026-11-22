import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PdfEngine } from '../engine-contract';
import { PDF_MAX_PAGE_POINTS } from '../limits';
import { readerWasm } from '../testing/fixtures';
import { createPdfEngine } from './index';
import { writePicturePages, type PicturePage } from './picture-pages';

let engine: PdfEngine;

beforeAll(async () => {
  engine = await createPdfEngine({ wasm: readerWasm() });
});

/** A picture of one colour. */
const plain = (
  width: number,
  height: number,
  [r, g, b]: readonly [number, number, number],
  page: { pageWidth: number; pageHeight: number },
): PicturePage => ({
  width,
  height,
  rgb: Uint8Array.from({ length: width * height * 3 }, (_, at) => [r, g, b][at % 3]!),
  ...page,
});

const written = async (pages: readonly PicturePage[]) => {
  const result = await writePicturePages(pages, {
    title: 'Quarterly plan',
    at: new Date(Date.UTC(2026, 10, 22)),
  });
  if (!result.ok) throw new Error(result.refusal);
  return result.bytes;
};

// files-print-and-sync.md "One writer": every kind's Download as PDF is written by the repository's one PDF writer.
describe('pages of pictures written as a PDF', () => {
  it('writes a page a picture, each the size in points it was given, its picture across the whole of it', async () => {
    const bytes = await written([
      plain(4, 2, [255, 0, 0], { pageWidth: 400, pageHeight: 200 }),
      plain(3, 3, [0, 0, 255], { pageWidth: 150.5, pageHeight: 300 }),
    ]);
    const opened = await engine.open(bytes);
    if (!opened.ok) throw new Error('the written file did not open');
    expect(opened.pages.map((page) => [page.width, page.height])).toEqual([
      [400, 200],
      [150.5, 300],
    ]);
    const first = (await engine.drawPage(0, 0.1))!;
    for (const at of [0, first.rgba.length - 4])
      expect([...first.rgba.slice(at, at + 4)]).toEqual([255, 0, 0, 255]);
    const second = (await engine.drawPage(1, 0.1))!;
    expect([...second.rgba.slice(0, 4)]).toEqual([0, 0, 255, 255]);
  });

  it('keeps every pixel as it was given: a picture is packed, never re-encoded', async () => {
    const rgb = Uint8Array.from({ length: 16 * 16 * 3 }, (_, at) => (at * 7) % 256);
    const bytes = await written([{ width: 16, height: 16, rgb, pageWidth: 16, pageHeight: 16 }]);
    await engine.open(bytes);
    const drawn = (await engine.drawPage(0, 1))!;
    const seen = Array.from({ length: 16 * 16 * 3 }, (_, at) => {
      const pixel = Math.floor(at / 3);
      return drawn.rgba[pixel * 4 + (at % 3)];
    });
    expect(seen).toEqual([...rgb]);
  });

  it('says its title, that LiveDoc made it and when, and names no author', async () => {
    const opened = await engine.open(
      await written([plain(1, 1, [0, 0, 0], { pageWidth: 10, pageHeight: 10 })]),
    );
    expect(opened.ok && opened.document.properties).toEqual({
      title: 'Quarterly plan',
      author: '',
      subject: '',
      keywords: '',
      creator: 'LiveDoc',
      producer: 'LiveDoc',
      created: 'D:20261122000000Z',
      modified: 'D:20261122000000Z',
    });
    // A file given no title has none, and never the writer's placeholder.
    const untitled = await writePicturePages([
      plain(1, 1, [0, 0, 0], { pageWidth: 10, pageHeight: 10 }),
    ]);
    const read = await engine.open(untitled.ok ? untitled.bytes : new Uint8Array());
    expect(read.ok && read.document.properties.title).toBe('');
  });

  it('refuses by name what is no PDF: no page, a picture that is not its size, a page out of bounds', async () => {
    const page = { pageWidth: 10, pageHeight: 10 };
    expect(await writePicturePages([])).toEqual({ ok: false, refusal: 'no_pages' });
    for (const picture of [
      { ...plain(2, 2, [0, 0, 0], page), rgb: new Uint8Array(11) },
      { ...plain(2, 2, [0, 0, 0], page), width: 0 },
      { ...plain(2, 2, [0, 0, 0], page), height: 1.5 },
    ])
      expect(await writePicturePages([picture])).toEqual({ ok: false, refusal: 'picture_size' });
    for (const size of [
      { pageWidth: 0, pageHeight: 10 },
      { pageWidth: 10, pageHeight: PDF_MAX_PAGE_POINTS + 1 },
      { pageWidth: Number.NaN, pageHeight: 10 },
    ])
      expect(await writePicturePages([plain(1, 1, [0, 0, 0], size)])).toEqual({
        ok: false,
        refusal: 'page_size',
      });
  });

  it('passes qpdf’s check', async ({ skip }) => {
    try {
      execFileSync('qpdf', ['--version'], { stdio: 'ignore' });
    } catch {
      skip('qpdf is not installed here; CI’s Office files job runs it');
    }
    const file = join(mkdtempSync(join(tmpdir(), 'pdf-pictures-')), 'pictures.pdf');
    writeFileSync(
      file,
      await written([
        plain(4, 2, [255, 0, 0], { pageWidth: 400, pageHeight: 200 }),
        plain(3, 3, [0, 0, 255], { pageWidth: 150, pageHeight: 300 }),
      ]),
    );
    expect(() => execFileSync('qpdf', ['--check', file], { stdio: 'pipe' })).not.toThrow();
  });
});

// docs/specs/035-pdf-documents/dark-pages.md "The recolouring", "Telemetry and observability", "Errors": a page drawn
// as Dark pages in the engine's worker, its photographs put back as drawn, judged alike for a page and every tile,
// turned or not; a scanned page and a chart's bar mirrored; the step logged, sampled; a failed step shows the page as
// drawn.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DARK_INK, DarkPages } from '../dark-pages';
import type { PageBitmap, PdfEngine } from '../engine-contract';
import { DARK_PAGES_PARTS, darkPagesPdf, readerWasm } from '../testing/fixtures';
import { darkened, pagePlace, photographsOf } from './dark-step';
import { pdfEngineOver } from './engine';
import { startReader, type Pdfium } from './reader';
import { ReaderFile } from './reader-file';

let pdfium: Pdfium;
beforeAll(async () => {
  pdfium = await startReader(readerWasm());
});

async function opened(log: (line: string) => void = () => {}): Promise<PdfEngine> {
  const engine = pdfEngineOver(pdfium, undefined, log);
  const result = await engine.open(darkPagesPdf());
  if (!result.ok) throw new Error('the Dark pages file did not open');
  return engine;
}

/** The colour of a bitmap at a point of its page, in page points, through its matrix; `scale` pixels a point. */
function at(bitmap: PageBitmap, x: number, y: number, scale = 1, offset = { x: 0, y: 0 }): number {
  const [a, b, c, d, e, f] = bitmap.toView;
  const px = Math.floor((a * x + c * y + e) * scale - offset.x);
  const py = Math.floor((b * x + d * y + f) * scale - offset.y);
  const i = (py * bitmap.width + px) * 4;
  return (bitmap.rgba[i]! << 16) | (bitmap.rgba[i + 1]! << 8) | bitmap.rgba[i + 2]!;
}
const middle = (part: readonly number[]): [number, number] => [
  part[0]! + part[2]! / 2,
  part[1]! + part[3]! / 2,
];
const PAPER = DarkPages.colour(0xffffff);

describe('a page drawn as Dark pages', () => {
  it('mirrors the paper, the ink and a chart’s bar, and puts the photograph back as drawn', async () => {
    const engine = await opened();
    const paper = (await engine.drawPage(0, 1))!;
    const dark = (await engine.drawPage(0, 1, 0, undefined, 'dark'))!;
    expect(at(dark, 500, 100)).toBe(PAPER);
    expect(at(dark, ...middle(DARK_PAGES_PARTS.ink))).toBe(DARK_INK);
    const chart = middle([DARK_PAGES_PARTS.chart[0], DARK_PAGES_PARTS.chart[1], 80, 100]);
    expect(at(paper, ...chart)).toBe(0x3366cc);
    expect(at(dark, ...chart)).toBe(DarkPages.colour(0x3366cc));
    const photograph = middle(DARK_PAGES_PARTS.photograph);
    expect(at(dark, ...photograph)).toBe(at(paper, ...photograph));
    expect(at(dark, ...photograph)).not.toBe(DarkPages.colour(at(paper, ...photograph)));
  });

  it('judges a photograph alike on a tile at another scale, and on a page turned', async () => {
    const engine = await opened();
    const rect = { x: 200, y: 500, width: 400, height: 400 };
    const paperTile = (await engine.drawTile(0, 2, 0, rect))!;
    const darkTile = (await engine.drawTile(0, 2, 0, rect, undefined, 'dark'))!;
    const photograph: [number, number] = [150, 450];
    expect(at(darkTile, ...photograph, 2, rect)).toBe(at(paperTile, ...photograph, 2, rect));
    expect(at(darkTile, 290, 450, 2, rect)).toBe(PAPER);
    const turned = (await engine.drawPage(0, 1, 1, undefined, 'dark'))!;
    const turnedPaper = (await engine.drawPage(0, 1, 1))!;
    expect(at(turned, ...middle(DARK_PAGES_PARTS.photograph))).toBe(
      at(turnedPaper, ...middle(DARK_PAGES_PARTS.photograph)),
    );
  });

  it('mirrors a picture that covers the page, as a scanned page is', async () => {
    const engine = await opened();
    const paper = (await engine.drawPage(1, 0.5))!;
    const dark = (await engine.drawPage(1, 0.5, 0, undefined, 'dark'))!;
    expect(at(dark, 300, 400, 1)).toBe(DarkPages.colour(at(paper, 300, 400, 1)));
  });

  it('draws as the file says unless asked', async () => {
    const engine = await opened();
    expect(at((await engine.drawPage(0, 1, 0, undefined, 'paper'))!, 500, 100)).toBe(0xffffff);
  });

  it('logs the first step and then one in fifty, with its time and the photographs put back', async () => {
    const log = vi.fn();
    const engine = await opened(log);
    await engine.drawPage(0, 1, 0, undefined, 'dark');
    await engine.drawPage(0, 1, 0, undefined, 'dark');
    const steps = log.mock.calls
      .map(([line]) => line as string)
      .filter((line) => line.includes('dark-pages'));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatch(/^\[pdf\] dark-pages step ms=\d+ pictures=1$/);
  });
});

describe('what is judged', () => {
  it('keeps nothing on a tile far from the photograph, and judges no page that is none', async () => {
    const engine = await opened();
    const rect = { x: 0, y: 1300, width: 200, height: 200 };
    const tile = (await engine.drawTile(0, 2, 0, rect, undefined, 'dark'))!;
    expect(at(tile, 20, 100, 2, rect)).toBe(PAPER);
    const file = new ReaderFile(pdfium);
    file.load(darkPagesPdf(), '');
    file.count = 2;
    expect(photographsOf(file, 9)).toEqual([]);
    expect(pagePlace(file, 9, 0, 10)).toEqual({ factor: 1, x: 0, y: 0 });
    // One photograph on page one: the small picture, the one of a bit a pixel and the one off the page are not.
    expect(photographsOf(file, 0)).toHaveLength(1);
    file.close();
  });
});

describe('a step that fails', () => {
  it('hands back the bitmap as drawn and says so', () => {
    const file = new ReaderFile(pdfium);
    expect(file.load(darkPagesPdf(), '')).toBe(true);
    file.count = 2;
    const drawn: PageBitmap = {
      width: 1,
      height: 1,
      rgba: new Uint8ClampedArray([255, 255, 255, 255]),
      toView: [1, 0, 0, -1, 0, 792],
    };
    const shown = darkened(file, 0, drawn, { factor: 1, x: 0, y: 0 }, () => {
      throw new Error('no memory');
    });
    expect(shown).toBe(drawn);
    expect(file.darkStep).toEqual({ failed: true });
    file.close();
  });
});

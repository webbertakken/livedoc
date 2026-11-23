// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages" (tiles over the part in view where the picture is
// softer than the screen; kept and shown again from the cache), "Errors" (a tile that fails is asked for once more).
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageBitmap } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { pdfTileCache } from '@/lib/pdf-document/pdf-tile-cache';
import type { PdfLayoutRect } from '@/lib/pdf-document/pdf-tiles';
import { PdfPageTiles, type PdfTileSource } from './PdfPageTiles';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const bitmap = (): PageBitmap => ({
  width: 4,
  height: 4,
  rgba: new Uint8ClampedArray(64),
  toView: [1, 0, 0, 1, 0, 0],
});

function source(
  view: PdfLayoutRect,
  drawTile = vi.fn(async (): Promise<PageBitmap | null> => bitmap()),
) {
  const watchers = new Set<() => void>();
  let shown = view;
  const store = {
    get: () => shown,
    subscribe: (watcher: () => void) => {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
  };
  const tiles: PdfTileSource = {
    drawer: {
      draw: async () => null,
      forget: () => {},
      drawTile,
      forgetTile: vi.fn(),
      drawThumbnail: async () => null,
      forgetThumbnail: () => {},
      firstDrawn: () => new Promise<void>(() => {}),
    },
    cache: pdfTileCache(1_000_000),
    view: store,
    pixelRatio: 1,
  };
  const scrollTo = (next: PdfLayoutRect) => {
    shown = next;
    act(() => watchers.forEach((watcher) => watcher()));
  };
  return { tiles, drawTile, scrollTo };
}

// US Letter at 400%: 3,264 by 4,224 CSS pixels; its picture drawn at 1.4, softer than the screen's 4.
const BOX = { left: 0, top: 0, width: 3264, height: 4224 };
const VIEW = { left: 0, top: 0, width: 1000, height: 800 };

function show(tiles: PdfTileSource, over: { turns?: 0 | 1; pictureScale?: number } = {}) {
  return render(
    <div>
      <PdfPageTiles
        index={0}
        width={612}
        height={792}
        cssPerPoint={(4 * 96) / 72}
        turns={over.turns ?? 0}
        pictureScale={over.pictureScale ?? 1.4}
        box={BOX}
        source={tiles}
      />
    </div>,
  );
}

const settle = () =>
  act(async () => {
    await vi.runAllTimersAsync();
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ImageData', class {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(debugLog).mockClear();
});

describe("a page's tiles", () => {
  it('draws the tiles in view and one around, over a picture softer than the screen', async () => {
    const { tiles, drawTile } = source(VIEW);
    const { container } = show(tiles);
    await settle();
    // The view, 1,000 by 800 CSS pixels at the page's corner, and a tile of 512 more each way: three by three.
    expect(container.querySelectorAll('[data-pdf-tile]')).toHaveLength(9);
    expect(drawTile).toHaveBeenCalledTimes(9);
    expect(drawTile.mock.calls[0]!.slice(1)).toEqual([
      0,
      (4 * 96) / 72,
      0,
      { x: 0, y: 0, width: 512, height: 512 },
    ]);
    expect(container.querySelector('[data-pdf-tile-drawn="true"]')).not.toBeNull();
  });

  it('draws none where the picture is as sharp as the screen', async () => {
    const { tiles, drawTile } = source(VIEW);
    const { container } = show(tiles, { pictureScale: (4 * 96) / 72 });
    await settle();
    expect(container.querySelectorAll('[data-pdf-tile]')).toHaveLength(0);
    expect(drawTile).not.toHaveBeenCalled();
  });

  it('shows a tile scrolled back to from the cache, never drawing it again', async () => {
    const { tiles, drawTile, scrollTo } = source(VIEW);
    show(tiles);
    await settle();
    scrollTo({ ...VIEW, top: 3000 });
    await settle();
    const drawn = drawTile.mock.calls.length;
    scrollTo(VIEW);
    await settle();
    expect(drawTile.mock.calls.length).toBe(drawn);
  });

  it('asks for a tile that fails once more, and says so', async () => {
    const drawTile = vi.fn(async (): Promise<PageBitmap | null> => null);
    const { tiles } = source({ left: 0, top: 0, width: 10, height: 10 }, drawTile);
    show(tiles);
    await settle();
    // The view's tile and the ones around it that the page holds: four, each asked twice.
    expect(drawTile).toHaveBeenCalledTimes(8);
    expect(debugLog).toHaveBeenCalledWith('[pdf] tile-failed page=1 again=yes');
    expect(debugLog).toHaveBeenCalledWith('[pdf] tile-failed page=1 again=no');
  });

  it('shows no tile of the page turned otherwise', async () => {
    const { tiles } = source(VIEW);
    const shown = show(tiles);
    await settle();
    shown.rerender(
      <div>
        <PdfPageTiles
          index={0}
          width={792}
          height={612}
          cssPerPoint={(4 * 96) / 72}
          turns={1}
          pictureScale={1.4}
          box={{ ...BOX, width: 4224, height: 3264 }}
          source={tiles}
        />
      </div>,
    );
    expect(shown.container.querySelectorAll('[data-pdf-tile]')).toHaveLength(0);
    await settle();
    expect(shown.container.querySelector('[data-pdf-tile]')!.getAttribute('data-pdf-tile')).toMatch(
      /^0:[\d.]+:1:/,
    );
  });
});

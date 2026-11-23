'use client';

// A page's sharp tiles (docs/specs/035-pdf-documents/reading-surface.md "The pages"): where the whole-page picture is
// softer than the screen, the part of the page in view and one tile around it, drawn by the engine at the screen's
// scale over the picture. Each tile is placed as a share of the page, so during a zoom the tiles there grow and shrink
// with it; the new zoom's tiles are drawn once it has rested, and take their place.
import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PageTurns } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { paintPicture, REDRAW_SETTLE_MS } from '@/lib/pdf-document/pdf-paint';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import type { PdfTileCache } from '@/lib/pdf-document/pdf-tile-cache';
import { PdfTiles, type PdfLayoutRect, type PdfTile } from '@/lib/pdf-document/pdf-tiles';
import type { PdfViewStore } from '@/lib/pdf-document/usePdfView';

/** What a page's tiles are drawn with, shared by every page of a surface. */
export type PdfTileSource = {
  drawer: PdfPageDrawer;
  cache: PdfTileCache;
  view: PdfViewStore;
  /** Device pixels a CSS pixel tiles are drawn at (PdfDevice.tilePixelRatio). */
  pixelRatio: number;
};

type Settled = { scale: number; turns: PageTurns };

const PdfTileCanvas = memo(function PdfTileCanvas({
  tile,
  index,
  settled,
  source,
}: {
  tile: PdfTile;
  index: number;
  settled: Settled;
  source: PdfTileSource;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [shown, setShown] = useState(false);
  const { key, rect } = tile;
  const { x, y, width, height } = rect;
  const { scale, turns } = settled;
  useEffect(() => {
    const { drawer, cache } = source;
    const kept = cache.get(key);
    if (kept && canvas.current) {
      paintPicture(canvas.current, kept);
      setShown(true);
      return;
    }
    let cancelled = false;
    // "Errors": a tile that fails is asked for once more; the whole-page picture stays under it meanwhile.
    const ask = (again: boolean) =>
      void drawer.drawTile(key, index, scale, turns, { x, y, width, height }).then((bitmap) => {
        if (cancelled) return;
        if (!bitmap) {
          debugLog(`[pdf] tile-failed page=${index + 1} again=${again ? 'no' : 'yes'}`);
          if (!again) ask(true);
          return;
        }
        cache.put(key, bitmap);
        if (!canvas.current) return;
        paintPicture(canvas.current, bitmap);
        setShown(true);
      });
    ask(false);
    return () => {
      cancelled = true;
      drawer.forgetTile(key);
    };
  }, [key, x, y, width, height, index, scale, turns, source]);
  const { share } = tile;
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      data-pdf-tile={tile.key}
      data-pdf-tile-drawn={shown ? 'true' : 'false'}
      className={`absolute ${shown ? '' : 'invisible'}`}
      style={{
        left: `${share.left * 100}%`,
        top: `${share.top * 100}%`,
        width: `${share.width * 100}%`,
        height: `${share.height * 100}%`,
      }}
    />
  );
});

export function PdfPageTiles({
  index,
  width,
  height,
  cssPerPoint,
  turns,
  pictureScale,
  box,
  source,
}: {
  index: number;
  /** The page's size as it shows (turned), in points. */
  width: number;
  height: number;
  cssPerPoint: number;
  turns: PageTurns;
  /** The scale the whole-page picture is drawn at, in device pixels a point. */
  pictureScale: number;
  /** The page's box in the layout. */
  box: PdfLayoutRect;
  source: PdfTileSource;
}) {
  const scale = cssPerPoint * source.pixelRatio;
  const needed = PdfTiles.needed(pictureScale, scale);
  // The zoom and turn the tiles are drawn at: the one shown once it has rested, the first one at once.
  const [settled, setSettled] = useState<Settled | null>(null);
  useEffect(() => {
    if (!needed) return;
    if (settled && settled.scale === scale && settled.turns === turns) return;
    const timer = setTimeout(
      () => setSettled({ scale, turns }),
      settled && settled.turns === turns ? REDRAW_SETTLE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [needed, scale, turns, settled]);

  const page = settled && {
    index,
    width,
    height,
    scale: settled.scale,
    turns: settled.turns,
    pixelRatio: source.pixelRatio,
  };
  // The tiles in view, as one key, so a scroll that keeps the same tiles renders nothing.
  const inView = useSyncExternalStore(
    source.view.subscribe,
    () =>
      page
        ? PdfTiles.inView(page, box, source.view.get())
            .map((tile) => tile.key)
            .join(' ')
        : '',
    () => '',
  );
  // Read again with the names: a tile's canvas is held by its name, so a new list of the same tiles draws nothing.
  const tiles = page && inView ? PdfTiles.inView(page, box, source.view.get()) : [];
  // A picture of the page turned otherwise is never shown on this one.
  if (!needed || !settled || settled.turns !== turns) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      data-pdf-tiles={tiles.length}
    >
      {tiles.map((tile) => (
        <PdfTileCanvas key={tile.key} tile={tile} index={index} settled={settled} source={source} />
      ))}
    </div>
  );
}

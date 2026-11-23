// The tiles a surface keeps (docs/specs/035-pdf-documents/reading-surface.md "The pages"): a tile scrolled back to is
// shown from here, not drawn again; past the budget, the least lately shown is let go first.
import type { PageBitmap } from '@livedoc/pdf-documents';

export type PdfTileCache = {
  /** The tile, now the most lately shown; undefined where it is not kept. */
  get: (key: string) => PageBitmap | undefined;
  put: (key: string, tile: PageBitmap) => void;
  /** The bytes kept now. */
  bytes: () => number;
};

export function pdfTileCache(budget: number): PdfTileCache {
  // A Map keeps the order things were set in: the first is the least lately shown.
  const kept = new Map<string, PageBitmap>();
  let total = 0;
  const drop = (key: string) => {
    const tile = kept.get(key);
    if (!tile) return;
    kept.delete(key);
    total -= tile.rgba.byteLength;
  };
  return {
    get: (key) => {
      const tile = kept.get(key);
      if (!tile) return undefined;
      kept.delete(key);
      kept.set(key, tile);
      return tile;
    },
    put: (key, tile) => {
      drop(key);
      // A tile larger than the whole budget is shown, never kept.
      if (tile.rgba.byteLength > budget) return;
      kept.set(key, tile);
      total += tile.rgba.byteLength;
      for (const oldest of kept.keys()) {
        if (total <= budget) break;
        drop(oldest);
      }
    },
    bytes: () => total,
  };
}

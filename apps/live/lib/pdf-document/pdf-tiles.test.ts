// docs/specs/035-pdf-documents/reading-surface.md "The pages": tiles only where the whole-page picture is softer than
// the screen; the part of the page in view and one tile around it; PDF_TILE_PX CSS pixels a side, cut at the edge.
import { describe, expect, it } from 'vitest';
import { PDF_TILE_PX } from '@livedoc/pdf-documents';
import { PdfTiles, type PdfTiledPage } from './pdf-tiles';

// US Letter at 400% on a screen of two device pixels a CSS pixel: 4,896 by 6,336 device pixels.
const PAGE: PdfTiledPage = { index: 2, width: 612, height: 792, scale: 8, turns: 0, pixelRatio: 2 };
// Its box in the layout: 2,448 by 3,168 CSS pixels.
const BOX = { left: 24, top: 1000, width: 2448, height: 3168 };
const SIDE = PDF_TILE_PX * 2;

describe('when a page has tiles', () => {
  it('has them only where its picture is softer than the screen', () => {
    expect(PdfTiles.needed(2, 8)).toBe(true);
    expect(PdfTiles.needed(2, 2)).toBe(false);
    expect(PdfTiles.needed(2, 2.01)).toBe(false);
  });
});

describe('the tiles in view', () => {
  it('covers the part in view and one tile around it', () => {
    // The view: 1,000 by 800 CSS pixels, 600 into the page across and 1,200 down.
    const view = { left: 24 + 600, top: 1000 + 1200, width: 1000, height: 800 };
    const tiles = PdfTiles.inView(PAGE, BOX, view);
    // In device pixels the view is 1,200 to 3,200 across and 2,400 to 4,000 down; a tile is 1,024, and one more each
    // way reaches 176 to 4,224 and 1,376 to 5,024.
    const columns = [...new Set(tiles.map((tile) => tile.rect.x / SIDE))];
    const rows = [...new Set(tiles.map((tile) => tile.rect.y / SIDE))];
    expect(columns).toEqual([0, 1, 2, 3, 4]);
    expect(rows).toEqual([1, 2, 3, 4]);
    expect(tiles).toHaveLength(20);
  });

  it('cuts a tile at the page’s edge and names each by page, scale, turn, column and row', () => {
    const tiles = PdfTiles.inView(PAGE, BOX, {
      left: 24 + 2000,
      top: 1000 + 2800,
      width: 1000,
      height: 800,
    });
    const corner = tiles.find((tile) => tile.rect.x === 4 * SIDE && tile.rect.y === 6 * SIDE)!;
    expect(corner.rect).toEqual({ x: 4096, y: 6144, width: 4896 - 4096, height: 6336 - 6144 });
    expect(corner.key).toBe('2:8:0:4:6');
    expect(corner.share.left + corner.share.width).toBeCloseTo(1, 9);
    expect(corner.share.top + corner.share.height).toBeCloseTo(1, 9);
  });

  it('places each tile as a share of the page, so it grows and shrinks with it', () => {
    const [first] = PdfTiles.inView(PAGE, BOX, { left: 0, top: 900, width: 500, height: 400 });
    expect(first!.share).toEqual({ left: 0, top: 0, width: 1024 / 4896, height: 1024 / 6336 });
  });

  it('has none for a page out of view, or of no size', () => {
    expect(PdfTiles.inView(PAGE, BOX, { left: 0, top: 9000, width: 1000, height: 800 })).toEqual(
      [],
    );
    expect(PdfTiles.inView(PAGE, { ...BOX, width: 0 }, { ...BOX })).toEqual([]);
  });

  it('reads a page on its side as it shows', () => {
    const turned = { ...PAGE, width: 792, height: 612, turns: 1 };
    const tiles = PdfTiles.inView(
      turned,
      { ...BOX, width: 3168, height: 2448 },
      { left: 0, top: 0, width: 4000, height: 4000 },
    );
    expect(Math.max(...tiles.map((tile) => tile.rect.x + tile.rect.width))).toBe(6336);
    expect(tiles[0]!.key).toBe('2:8:1:0:0');
  });
});

// A page's tiles (docs/specs/035-pdf-documents/reading-surface.md "The pages"): where its whole-page picture is softer
// than the screen, the part of the page in view and one tile around it is drawn sharp, in tiles of PDF_TILE_PX CSS
// pixels a side. Pure: which tiles a view needs, each as pixels of the whole page for the engine and as a share of the
// page for the screen, so a tile drawn at one zoom grows and shrinks with the page until its zoom's tiles arrive.
import { PDF_TILE_PX, type TileRect } from '@livedoc/pdf-documents';

/** A rectangle in CSS pixels of the pages' layout. */
export type PdfLayoutRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/** A share of the page, 0 to 1 across and down, as it shows (turned). */
export type PdfPageShare = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export type PdfTile = {
  /** The tile's name: its page, its scale, its turn, its column and its row. */
  readonly key: string;
  /** The pixels of the whole page, at `scale`, it is drawn from. */
  readonly rect: TileRect;
  /** Where it shows on the page. */
  readonly share: PdfPageShare;
};

/** How a page is drawn for tiles: its index, its size as shown in points, the engine's scale and the turn. */
export type PdfTiledPage = {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  /** Device pixels a point: the screen's scale. */
  readonly scale: number;
  readonly turns: number;
  /** Device pixels a CSS pixel. */
  readonly pixelRatio: number;
};

// A scale this much over the picture's is sharper than it: under it, the picture already serves.
const SOFTER = 1.01;

export const PdfTiles = {
  /** Whether a page drawn as a picture at `pictureScale` is softer than the screen's `scale`. */
  needed: (pictureScale: number, scale: number): boolean => scale > pictureScale * SOFTER,

  /** The tiles of a page in view, and one tile around it; none where the page is out of view. */
  inView: (page: PdfTiledPage, box: PdfLayoutRect, view: PdfLayoutRect): PdfTile[] => {
    const whole = {
      width: Math.round(page.width * page.scale),
      height: Math.round(page.height * page.scale),
    };
    const side = PDF_TILE_PX * page.pixelRatio;
    if (whole.width < 1 || whole.height < 1 || box.width <= 0 || box.height <= 0) return [];
    // The view over the box, as pixels of the whole page, one tile wider each way.
    const toWhole = whole.width / box.width;
    const from = {
      x: (view.left - box.left) * toWhole - side,
      y: (view.top - box.top) * toWhole - side,
    };
    const to = {
      x: (view.left + view.width - box.left) * toWhole + side,
      y: (view.top + view.height - box.top) * toWhole + side,
    };
    const columns = Math.ceil(whole.width / side);
    const rows = Math.ceil(whole.height / side);
    const first = {
      column: Math.max(0, Math.floor(from.x / side)),
      row: Math.max(0, Math.floor(from.y / side)),
    };
    const last = {
      column: Math.min(columns - 1, Math.ceil(to.x / side) - 1),
      row: Math.min(rows - 1, Math.ceil(to.y / side) - 1),
    };
    const tiles: PdfTile[] = [];
    for (let row = first.row; row <= last.row; row += 1)
      for (let column = first.column; column <= last.column; column += 1) {
        const x = column * side;
        const y = row * side;
        const width = Math.min(side, whole.width - x);
        const height = Math.min(side, whole.height - y);
        tiles.push({
          key: `${page.index}:${page.scale}:${page.turns}:${column}:${row}`,
          rect: { x, y, width, height },
          share: {
            left: x / whole.width,
            top: y / whole.height,
            width: width / whole.width,
            height: height / whole.height,
          },
        });
      }
    return tiles;
  },
} as const;

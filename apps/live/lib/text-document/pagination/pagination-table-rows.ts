// A table row breaking between its lines (docs/specs/034-text-documents/tables.md "Laying out across pages"): it breaks
// only where no cell's line crosses, so each cell's writing up to there stays and the rest goes on at the next page's
// top. Read from each cell's drawn lines; positions in CSS pixels from the row's top, without page spacers.
import type { Node as PmNode } from 'prosemirror-model';
import { groupLines, withoutSpacers, type Span } from './pagination-lines';
import { measuringRange } from './pagination-range';

/** Two cells' line boundaries this close are one place to break (rounding, a pixel of padding). */
export const ROW_BREAK_TOLERANCE_PX = 2;

/**
 * The places inside a row of `height` where it may break, in order: each a boundary between two lines of some cell
 * that no other cell's line crosses. `cells` holds each cell's drawn rectangles (text, or a whole thing that moves
 * whole such as a nested table), from the row's top.
 */
export function rowBreaks(cells: readonly (readonly Span[])[], height: number): number[] {
  const tolerance = ROW_BREAK_TOLERANCE_PX;
  const linesOf = cells.map((rects) => {
    const drawn = rects.filter((r) => r.bottom > r.top);
    if (drawn.length === 0) return [];
    const top = Math.min(...drawn.map((r) => r.top));
    const bottom = Math.max(...drawn.map((r) => r.bottom));
    return groupLines(drawn, top, bottom);
  });
  // Where a cell may break: before its first line, between two of its lines, after its last.
  const fits = (lines: readonly Span[], y: number) =>
    lines.length === 0 ||
    y <= lines[0]!.top + tolerance ||
    y >= lines[lines.length - 1]!.bottom - tolerance ||
    lines.some((line, k) => k > 0 && Math.abs(line.top - y) <= tolerance);
  const candidates = linesOf
    .flatMap((lines) => lines.slice(1).map((line) => line.top))
    .filter((y) => y > tolerance && y < height - tolerance)
    .sort((a, b) => a - b);
  const breaks: number[] = [];
  for (const y of candidates) {
    if (breaks.length > 0 && y - breaks[breaks.length - 1]! <= tolerance) continue;
    if (linesOf.every((lines) => fits(lines, y))) breaks.push(y);
  }
  return breaks;
}

// What a row's cells were read at, by the row: read again only when the row, its drawn size or the zoom changes.
const known = new WeakMap<PmNode, { key: string; breaks: number[] }>();

/**
 * Each cell's drawn rectangles in `row`, from the row's natural top (`rowTop`, CSS pixels from the table's `top`),
 * without the page spacers (`spacers`, from the table's top): a paragraph's text, a nested table whole.
 */
function cellRects(
  row: HTMLTableRowElement,
  top: number,
  rowTop: number,
  ratio: number,
  spacers: readonly Span[],
): Span[][] {
  const range = measuringRange(row.ownerDocument);
  return [...row.cells].map((cell) => {
    const rects: Span[] = [];
    for (const child of cell.children) {
      const own =
        child instanceof HTMLTableElement
          ? [child.getBoundingClientRect()]
          : (range.selectNodeContents(child), [...range.getClientRects()]);
      for (const r of own)
        rects.push({ top: (r.top - top) / ratio, bottom: (r.bottom - top) / ratio });
    }
    return withoutSpacers(rects, spacers).map((r) => ({
      top: r.top - rowTop,
      bottom: r.bottom - rowTop,
    }));
  });
}

/** Where drawn `row` (of node `node`, when known) may break, `height` high from its natural top `rowTop`. */
export function drawnRowBreaks(
  row: HTMLTableRowElement,
  node: PmNode | undefined,
  input: {
    readonly top: number;
    readonly rowTop: number;
    readonly height: number;
    readonly ratio: number;
    readonly spacers: readonly Span[];
  },
): number[] {
  const { top, rowTop, height, ratio, spacers } = input;
  const key = `${Math.round(height * 100)}:${Math.round(row.getBoundingClientRect().width / ratio)}:${ratio}`;
  const cached = node && known.get(node);
  if (cached && cached.key === key) return cached.breaks;
  const breaks = rowBreaks(cellRects(row, top, rowTop, ratio, spacers), height);
  if (node) known.set(node, { key, breaks });
  return breaks;
}

// The lines of the numbered sections as drawn (docs/specs/034-text-documents/page-layout.md "Line numbers", "Drawn"):
// a block's measured lines from its drawn top, each line below a page start inside the block moved down by that page's
// gap; its column the one the layout put it in. A paragraph drawn as a box of columns is read from its text, each
// stretch in the column its left edge is in. Reads the drawn page; writes nothing.
import { groupLines, type Span } from './pagination-lines';
import { pageAt, type DrawnLine } from './pagination-line-numbers';
import type { BlockMetrics } from './pagination';

/** A box of columns' columns across the body: the first's left edge, from one's start to the next's, and how many. */
export type CrossColumns = {
  readonly shift: number;
  readonly step: number;
  readonly count: number;
};

export type LineReading = {
  readonly body: HTMLElement;
  /** Client pixels per CSS pixel (the page's zoom). */
  readonly ratio: number;
  readonly metrics: readonly BlockMetrics[];
  readonly element: (block: number) => HTMLElement;
  /** The block is numbered: a paragraph in a section with line numbers. */
  readonly numbered: (block: number) => boolean;
  /** The page gaps inside a block: before its line `line`, `gap` high. */
  readonly gapsInside: ReadonlyMap<
    number,
    readonly { readonly line: number; readonly gap: number }[]
  >;
  /** The column each block past a region's first is in. */
  readonly columnOf: ReadonlyMap<number, number>;
  /** The blocks drawn as a box of columns, with their columns. */
  readonly crosses: ReadonlyMap<number, CrossColumns>;
  readonly pageTops: readonly number[];
};

/** The text's stretches in a block, in client pixels. */
function textRects(element: HTMLElement): DOMRect[] {
  const rects: DOMRect[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent) continue;
    range.selectNodeContents(node);
    rects.push(...range.getClientRects());
  }
  return rects;
}

/** A box of columns' lines: its text's stretches grouped by column, then by line; in page, column and line order. */
function crossLines(
  block: number,
  element: HTMLElement,
  columns: CrossColumns,
  origin: { readonly top: number; readonly left: number },
  ratio: number,
  pageTops: readonly number[],
): DrawnLine[] {
  const byColumn = new Map<number, Span[]>();
  for (const r of textRects(element)) {
    if (r.width === 0 && r.height === 0) continue;
    const left = (r.left - origin.left) / ratio - columns.shift;
    const column = Math.min(columns.count - 1, Math.max(0, Math.floor(left / columns.step + 0.01)));
    const spans = byColumn.get(column) ?? [];
    spans.push({ top: (r.top - origin.top) / ratio, bottom: (r.bottom - origin.top) / ratio });
    byColumn.set(column, spans);
  }
  const lines: (DrawnLine & { readonly page: number })[] = [];
  for (const [column, spans] of byColumn) {
    const top = Math.min(...spans.map((s) => s.top));
    const bottom = Math.max(...spans.map((s) => s.bottom));
    for (const line of groupLines(spans, top, bottom))
      lines.push({ block, column, ...line, page: pageAt(pageTops, (line.top + line.bottom) / 2) });
  }
  return lines
    .sort((a, b) => a.page - b.page || a.column - b.column || a.top - b.top)
    .map(({ page: _, ...line }) => line);
}

/** The numbered blocks' lines as drawn, in document order, from the body's top and left in CSS pixels. */
export function readDrawnLines(reading: LineReading): DrawnLine[] {
  const { body, ratio, metrics } = reading;
  const box = body.getBoundingClientRect();
  const lines: DrawnLine[] = [];
  metrics.forEach((own, block) => {
    if (own.atom || !reading.numbered(block)) return;
    const element = reading.element(block);
    const cross = reading.crosses.get(block);
    if (cross) {
      lines.push(...crossLines(block, element, cross, box, ratio, reading.pageTops));
      return;
    }
    const top = (element.getBoundingClientRect().top - box.top) / ratio;
    const column = reading.columnOf.get(block) ?? 0;
    const gaps = reading.gapsInside.get(block) ?? [];
    own.lines.forEach((line, k) => {
      const down = gaps.reduce((sum, g) => (g.line <= k ? sum + g.gap : sum), 0);
      lines.push({ block, column, top: top + down + line.top, bottom: top + down + line.bottom });
    });
  });
  return lines;
}

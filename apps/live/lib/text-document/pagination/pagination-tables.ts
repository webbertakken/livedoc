// A table laid out across pages (docs/specs/034-text-documents/tables.md "Laying out across pages"): its rows are its
// lines, rows joined by a cell spanning them one line, a row alone on its line broken into more where it may break.
import type { Node as PmNode } from 'prosemirror-model';
import type { LineBox } from './pagination';
import { headerRowsOf } from '../text-document-table-edits';
import { naturalOf, type Span } from './pagination-lines';
import { drawnRowBreaks } from './pagination-table-rows';

/** The first row of each line, from each row's cells' row spans: a row joins the line above while a cell spans into it. */
export function lineStarts(rowSpans: readonly (readonly number[])[]): number[] {
  const starts: number[] = [];
  // The last row a cell started so far reaches.
  let reach = -1;
  rowSpans.forEach((spans, r) => {
    if (r > reach) starts.push(r);
    for (const span of spans) reach = Math.max(reach, r + Math.max(1, span) - 1);
  });
  return starts;
}

/** Where row `row` starts, from the table's start: after its opening and the rows before. */
export function tableRowOffset(table: PmNode, row: number): number {
  let offset = 1;
  for (let r = 0; r < row; r += 1) offset += table.child(r).nodeSize;
  return offset;
}

/** Where a table's line starts: its row, and how far into the row (0 at its top), in CSS pixels without spacers. */
export type TableLine = { readonly row: number; readonly at: number };

/**
 * What a table's `headerRows` repeat on each page it continues on (tables.md "Laying out across pages"), from where its
 * lines start (`places`) and its lines: none without a row below them, or when a cell spans from them into one.
 */
export function tableRepeat(
  places: readonly TableLine[],
  lines: readonly LineBox[],
  headerRows: number,
): { lines: number; height: number } | undefined {
  const count = places.findIndex((p) => p.row === headerRows && p.at === 0);
  if (headerRows <= 0 || count <= 0 || count >= lines.length) return undefined;
  return { lines: count, height: lines[count]!.top };
}

/** A drawn table as the layout reads it. */
export type MeasuredTable = {
  readonly lines: LineBox[];
  /** Where each line starts. */
  readonly places: TableLine[];
  /** Lines a page may not start at: inside a row that may not break. */
  readonly held: number[];
  readonly repeat?: { lines: number; height: number };
};

/**
 * A drawn table's lines in CSS pixels from its top, without the page gaps drawn in it (`spacers`): each line from its
 * start to the next line's, the first from the table's top and the last to its foot (`height`). A line starts at each
 * row, rows joined by a cell spanning them one line, and inside a row alone on its line where it may break; header
 * rows never break inside. `table` is its node, when known: its header rows and which rows may not break.
 */
export function measureTable(
  element: HTMLTableElement,
  top: number,
  ratio: number,
  spacers: readonly Span[],
  height: number,
  gapClass: string,
  table?: PmNode,
): MeasuredTable {
  const rows = [...(element.tBodies[0]?.rows ?? [])].filter((r) => !r.classList.contains(gapClass));
  const starts = lineStarts(rows.map((r) => [...r.cells].map((c) => c.rowSpan)));
  const headerRows = table ? headerRowsOf(table) : 0;
  const rowTop = (r: number) =>
    naturalOf((rows[r]!.getBoundingClientRect().top - top) / ratio, spacers);
  const tops: number[] = [];
  const places: TableLine[] = [];
  const held: number[] = [];
  starts.forEach((r, k) => {
    const natural = rowTop(r);
    tops.push(k === 0 ? 0 : natural);
    places.push({ row: r, at: 0 });
    const next = starts[k + 1];
    if ((next ?? rows.length) !== r + 1 || r < headerRows) return;
    const node = table && r < table.childCount ? table.child(r) : undefined;
    const bottom = next === undefined ? height : rowTop(next);
    const breaks = drawnRowBreaks(rows[r]!, node, {
      top,
      rowTop: natural,
      height: bottom - natural,
      ratio,
      spacers,
    });
    const mayBreak = (node?.attrs as { breaks?: unknown } | undefined)?.breaks !== false;
    for (const at of breaks) {
      if (!mayBreak) held.push(tops.length);
      tops.push(natural + at);
      places.push({ row: r, at });
    }
  });
  const lines = tops.map((t, k) => ({ top: t, bottom: tops[k + 1] ?? height }));
  const repeat = tableRepeat(places, lines, headerRows);
  return { lines, places, held, ...(repeat ? { repeat } : {}) };
}

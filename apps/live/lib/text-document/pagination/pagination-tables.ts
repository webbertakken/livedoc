// A table laid out across pages (docs/specs/034-text-documents/tables.md "Laying out across pages"): its rows are its
// lines, rows joined by a cell spanning them one line, and a page starting inside it starts before a line's first row.
import type { Node as PmNode } from 'prosemirror-model';
import type { LineBox } from './pagination';
import { naturalOf, type Span } from './pagination-lines';

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

const spansOf = (row: PmNode): number[] => {
  const spans: number[] = [];
  row.forEach((cell) => spans.push((cell.attrs as { rowspan: number }).rowspan || 1));
  return spans;
};

/** A table node's lines' first rows. */
export function tableLineRows(table: PmNode): number[] {
  const rows: number[][] = [];
  table.forEach((row) => rows.push(spansOf(row)));
  return lineStarts(rows);
}

/** Where the table's line `line` starts, from the table's start: after its opening and the rows before. */
export function tableSplitOffset(table: PmNode, line: number): number {
  const first = tableLineRows(table)[line] ?? 0;
  let offset = 1;
  for (let r = 0; r < first; r += 1) offset += table.child(r).nodeSize;
  return offset;
}

/**
 * A drawn table's lines in CSS pixels from its top, without the page gaps drawn between its rows (`spacers`): each line
 * from its first row's top to the next line's, the first from the table's top and the last to its foot (`height`).
 */
export function tableLines(
  element: HTMLTableElement,
  top: number,
  ratio: number,
  spacers: readonly Span[],
  height: number,
  gapClass: string,
): LineBox[] {
  const rows = [...(element.tBodies[0]?.rows ?? [])].filter((r) => !r.classList.contains(gapClass));
  const starts = lineStarts(rows.map((r) => [...r.cells].map((c) => c.rowSpan)));
  const tops = starts.map((r, k) =>
    k === 0 ? 0 : naturalOf((rows[r]!.getBoundingClientRect().top - top) / ratio, spacers),
  );
  return tops.map((t, k) => ({ top: t, bottom: tops[k + 1] ?? height }));
}

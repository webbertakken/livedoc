// A table fitted to the text (docs/specs/034-text-documents/review.md "Rows and columns"): a column accepted into a
// table that then runs past the text's width has every cell's widths scaled so the table is the text's width again, an
// Editor's plain change, in the settling transaction (director, 2026-11-26).
import * as Y from 'yjs';
import { TABLE_CELL, TABLE_HEADER, TABLE_ROW } from './live-names';

const round = (value: number) => Math.round(value * 100) / 100;

const elements = (parent: Y.XmlElement, names: readonly string[]): Y.XmlElement[] =>
  parent
    .toArray()
    .filter((n): n is Y.XmlElement => n instanceof Y.XmlElement && names.includes(n.nodeName));

const widthsOf = (cell: Y.XmlElement): number[] => {
  const value = cell.getAttribute('colwidth') as unknown;
  return Array.isArray(value) ? value.filter((w): w is number => typeof w === 'number') : [];
};

/** Scales a table's cells' widths to sum to `width` points when its first row's sum past it; else leaves it. */
export function fitTableWidth(table: Y.XmlElement, width: number): void {
  const rows = elements(table, [TABLE_ROW]);
  const total = elements(rows[0] ?? table, [TABLE_CELL, TABLE_HEADER])
    .flatMap(widthsOf)
    .reduce((a, b) => a + b, 0);
  if (!(width > 0) || total <= width) return;
  const scale = width / total;
  for (const row of rows)
    for (const cell of elements(row, [TABLE_CELL, TABLE_HEADER])) {
      const widths = widthsOf(cell);
      if (widths.length > 0)
        cell.setAttribute('colwidth', widths.map((w) => round(w * scale)) as never);
    }
}

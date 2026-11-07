// A Sheet tab's part of its content search text (docs/specs/013-workspace/content-search.md
// "tabSearchText"): the inputs of its sheets' cells that are not formulas, each sheet row by row in layout order.

import { cellKey, type CellInput } from './sheet';
import type { SheetJson } from './sheet-json';

function inputText(input: CellInput | undefined): string | null {
  if (!input) return null;
  if ('s' in input) return input.s === '' ? null : input.s;
  if ('n' in input) return String(input.n);
  if ('b' in input) return input.b ? 'TRUE' : 'FALSE';
  return null;
}

export function sheetSearchInputs(sheets: readonly SheetJson[]): string[] {
  const texts: string[] = [];
  for (const sheet of sheets) {
    const inputs = new Map(sheet.cells.map((c) => [cellKey(c.r, c.c), c.i]));
    for (const row of sheet.layout.rows) {
      for (const col of sheet.layout.cols) {
        const text = inputText(inputs.get(cellKey(row, col)));
        if (text !== null) texts.push(text);
      }
    }
  }
  return texts;
}

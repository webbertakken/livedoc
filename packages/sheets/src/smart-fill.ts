// Smart Fill (docs/specs/029-sheets/grid-and-editing.md "Fill and move", D148, D149, D150): after a text is typed in a
// cell with text beside it, the column's typed texts in the block around it are examples of a pattern over the
// filled columns next to it; the column's empty cells in the block are offered what the pattern gives them.
import { typeInto } from './commands';
import type { Workbook } from './engine/workbook';
import { displayValue } from './number-format';
import { cellKey, type Sheet } from './sheet';
import type { CellChange, SheetWrite } from './store';
import { learnTextPattern, runTextPattern, type TextExample } from './text-patterns';

/** How many filled columns on each side of the typed cell are sources. */
export const SMART_FILL_SOURCES_EACH_SIDE = 3;
/** The most rows a block holds; the search for its edges stops there. */
export const SMART_FILL_ROWS_MAX = 5_000;
/** The longest example text a pattern is learnt from. */
export const SMART_FILL_TEXT_MAX = 200;

export type SmartFillOffer = {
  at: { r: number; c: number };
  cells: { r: number; text: string }[];
};

/** Why nothing is offered, for the log. */
export type SmartFillMiss = {
  miss:
    | 'not_typed'
    | 'no_sources'
    | 'formula'
    | 'too_few'
    | 'too_long'
    | 'no_pattern'
    | 'nothing_to_fill';
};

// A cell as the grid shows it ('' for nothing), and whether it holds a formula.
function shown(
  wb: Workbook,
  sheet: Sheet,
  r: number,
  c: number,
): { text: string; formula: boolean } {
  const cell = sheet.cells.get(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!));
  const formula = !!cell?.input && 'f' in cell.input;
  return { text: displayValue(wb.value(sheet.id, r, c), cell?.format, wb.locale).text, formula };
}

// The filled columns next to the typed cell on its row, nearest first on each side.
function sourcesOf(wb: Workbook, sheet: Sheet, at: { r: number; c: number }): number[] {
  const out: number[] = [];
  for (const step of [-1, 1])
    for (let i = 1, c = at.c + step; i <= SMART_FILL_SOURCES_EACH_SIDE; i++, c += step) {
      if (c < 0 || c >= sheet.layout.cols.length || !shown(wb, sheet, at.r, c).text) break;
      out.push(c);
    }
  return out.sort((a, b) => a - b);
}

/** What Smart Fill offers after a text was typed at `at`, or why it offers nothing. */
export function smartFillOffer(
  wb: Workbook,
  sheetId: string,
  at: { r: number; c: number },
): SmartFillOffer | SmartFillMiss {
  const sheet = wb.sheet(sheetId);
  if (!sheet || !sheet.layout.rows[at.r] || !sheet.layout.cols[at.c]) return { miss: 'not_typed' };
  const typed = shown(wb, sheet, at.r, at.c);
  if (!typed.text || typed.formula) return { miss: 'not_typed' };
  const sources = sourcesOf(wb, sheet, at);
  if (!sources.length) return { miss: 'no_sources' };
  const filled = (r: number) => sources.some((c) => shown(wb, sheet, r, c).text);
  let top = at.r;
  let bottom = at.r;
  while (bottom - top + 1 < SMART_FILL_ROWS_MAX && top > 0 && filled(top - 1)) top--;
  while (
    bottom - top + 1 < SMART_FILL_ROWS_MAX &&
    bottom + 1 < sheet.layout.rows.length &&
    filled(bottom + 1)
  )
    bottom++;
  const rows: { r: number; sources: string[]; target: string }[] = [];
  for (let r = top; r <= bottom; r++) {
    const target = shown(wb, sheet, r, at.c);
    if (target.formula) return { miss: 'formula' };
    rows.push({ r, sources: sources.map((c) => shown(wb, sheet, r, c).text), target: target.text });
  }
  const examples = rows.filter((x) => x.target);
  if (examples.some((x) => x.target.length > SMART_FILL_TEXT_MAX)) return { miss: 'too_long' };
  const toExample = (x: (typeof rows)[number]): TextExample => ({
    sources: x.sources,
    output: x.target,
  });
  // The block's first row is a header when the rest fit only without it.
  const headed = examples[0]?.r === top;
  const tries = headed ? [examples, examples.slice(1)] : [examples];
  if (tries.every((list) => list.length < 2)) return { miss: 'too_few' };
  for (const list of tries) {
    if (list.length < 2) continue;
    const pattern = learnTextPattern(list.map(toExample));
    if (!pattern) continue;
    const from = list === examples ? top : top + 1;
    const cells: SmartFillOffer['cells'] = [];
    for (const x of rows)
      if (x.r >= from && !x.target) {
        const text = runTextPattern(pattern, x.sources);
        if (text) cells.push({ r: x.r, text });
      }
    return cells.length ? { at, cells } : { miss: 'nothing_to_fill' };
  }
  return { miss: 'no_pattern' };
}

/** The offer's texts typed into its cells still empty (a text reading as a formula is left out); null for none. */
export function smartFillWrite(
  wb: Workbook,
  sheetId: string,
  offer: SmartFillOffer,
): SheetWrite | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const cells: CellChange[] = [];
  for (const { r, text } of offer.cells) {
    const rowId = sheet.layout.rows[r];
    const colId = sheet.layout.cols[offer.at.c];
    if (!rowId || !colId || sheet.cells.get(cellKey(rowId, colId))?.input || text.startsWith('='))
      continue;
    // A text past a cell's length is refused, as typing it would be.
    const typed = typeInto(wb, sheetId, { r, c: offer.at.c }, text)!;
    if (typed.ok) cells.push(...(typed.write as Extract<SheetWrite, { kind: 'cells' }>).cells);
  }
  return cells.length ? { kind: 'cells', cells } : null;
}

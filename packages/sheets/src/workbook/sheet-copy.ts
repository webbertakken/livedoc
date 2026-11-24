// A sheet copied into another spreadsheet (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar", Copy To,
// D184): its cells, formats and layout under a new id and title, its row and column ids kept, so its own references
// stand; a reference to another of its spreadsheet's sheets goes by that sheet's name, read where it lands. Its named
// ranges and card tables belong to its spreadsheet and stay; the copy is shown, whatever the sheet was. Pure.
import { mapFormulaRefs, refByTitle, type SheetsCtx } from '../formula/stored';
import type { CellInput, Sheet, SheetLayout, StoredFormula } from '../sheet';
import { cellToJson, type SheetCellJson } from '../sheet-json';

export type SheetCopy = { id: string; title: string; layout: SheetLayout; cells: SheetCellJson[] };

/** `sheet` copied as `to`, its formulas carried out of `ctx`, its spreadsheet. */
export function sheetCopyOf(
  sheet: Sheet,
  ctx: SheetsCtx,
  to: { id: string; title: string },
): SheetCopy {
  const carried = (f: StoredFormula) =>
    mapFormulaRefs(f, (ref) => (ref.s === undefined ? ref : refByTitle(ref, ctx)));
  const input = (i: CellInput): CellInput => ('f' in i ? { f: carried(i.f) } : i);
  const { names: _names, cardTables: _cards, hidden: _hidden, ...layout } = sheet.layout;
  return {
    id: to.id,
    title: to.title,
    layout: layout.formatRules
      ? {
          ...layout,
          formatRules: layout.formatRules.map((rule) =>
            rule.fx ? { ...rule, fx: carried(rule.fx) } : rule,
          ),
        }
      : layout,
    cells: [...sheet.cells].map(([key, cell]) => {
      const json = cellToJson(key, cell);
      return json.i ? { ...json, i: input(json.i) } : json;
    }),
  };
}

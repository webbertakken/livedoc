// A sheet copied into another spreadsheet (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar", Copy To,
// D184): its cells, formats and layout under a new id and title, its row and column ids kept, so its own references
// stand; a reference to another of its spreadsheet's sheets goes by that sheet's name, read where it lands. Its named
// ranges and card tables belong to its spreadsheet and stay; the copy is shown, whatever the sheet was. Pure.
import { mapFormulaRefs, refByTitle, type SheetsCtx } from '../formula/stored';
import type { CellInput, Sheet, SheetLayout, StoredFormula, ValidationRule } from '../sheet';
import { cellToJson, type SheetCellJson } from '../sheet-json';
import type { SheetObject } from '../objects/sheet-objects';

// A validation rule carried out of its spreadsheet: its formula as a cell's is, and a range on another of its
// sheets by that sheet's title, read where it lands.
function carriedRule(
  rule: ValidationRule,
  ctx: SheetsCtx,
  carried: (f: StoredFormula) => StoredFormula,
): ValidationRule {
  const fx = rule.fx ? { fx: carried(rule.fx) } : {};
  if (!rule.src || rule.src.s === undefined) return { ...rule, ...fx };
  const at = ctx.byId(rule.src.s);
  const { s: _s, ...corners } = rule.src;
  return { ...rule, ...fx, src: at ? { ...corners, st: at.title } : rule.src };
}

// A pivot table carried out of its spreadsheet: a source on another of its sheets by that sheet's title, as a range
// dropdown's is (pivot-tables.md "The model").
function carriedObject(object: SheetObject, ctx: SheetsCtx): SheetObject {
  if (object.kind !== 'pivot' || object.source?.s === undefined) return object;
  const at = ctx.byId(object.source.s);
  const { s: _s, ...corners } = object.source;
  return at ? { ...object, source: { ...corners, st: at.title } } : object;
}

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
  // Its protections stay behind, as its names do (data-tools.md "Protected ranges", D348).
  const {
    names: _names,
    cardTables: _cards,
    hidden: _hidden,
    protections: _protections,
    ...layout
  } = sheet.layout;
  return {
    id: to.id,
    title: to.title,
    layout: {
      ...layout,
      ...(layout.formatRules
        ? { formatRules: layout.formatRules.map((x) => (x.fx ? { ...x, fx: carried(x.fx) } : x)) }
        : {}),
      ...(layout.rules ? { rules: layout.rules.map((x) => carriedRule(x, ctx, carried)) } : {}),
      ...(layout.objects ? { objects: layout.objects.map((x) => carriedObject(x, ctx)) } : {}),
    },
    cells: [...sheet.cells].map(([key, cell]) => {
      const json = cellToJson(key, cell);
      return json.i ? { ...json, i: input(json.i) } : json;
    }),
  };
}

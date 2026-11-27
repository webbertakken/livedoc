// What a formula on one sheet may name of the workbook (docs/specs/029-sheets/formulas.md "References"): its own
// sheet, the others by title or id, and named ranges, as the compiler and the evaluator look them up.
import { posRangeOf } from '../layout';
import { nameHome } from '../range-names';
import { cellKey, type Sheet } from '../sheet';
import { sameTableName } from '../tables/table';
import type { SheetHandle, SheetsCtx } from '../formula/stored';

// A cell's text as entered (a table header's name, D443): a text's own, a number's or a boolean's as typed; none for
// an empty cell or a formula.
export function cellText(sheet: Sheet, r: string, c: string): string | undefined {
  const input = sheet.cells.get(cellKey(r, c))?.input;
  if (!input || 'f' in input) return undefined;
  if ('s' in input) return input.s;
  if ('n' in input) return String(input.n);
  return input.b ? 'TRUE' : 'FALSE';
}

export function sheetsCtxOf(
  sheets: ReadonlyMap<string, Sheet>,
  sheetId: string,
  inputMax: number,
): SheetsCtx {
  const handle = (s: Sheet): SheetHandle => ({
    id: s.id,
    title: s.title,
    layout: s.layout,
    text: (r, c) => cellText(s, r, c),
  });
  const own = sheets.get(sheetId);
  const list = [...sheets.values()].sort((a, b) => a.createdAt - b.createdAt);
  return {
    own: own ? handle(own) : { id: sheetId, title: '', layout: { rows: [], cols: [] } },
    inputMax,
    byTitle: (t) => {
      const lower = t.toLowerCase();
      const s = list.find((x) => x.title.toLowerCase() === lower);
      return s ? handle(s) : undefined;
    },
    byId: (id) => {
      const s = sheets.get(id);
      return s ? handle(s) : undefined;
    },
    name: (name) => {
      const home = nameHome(name, own, list);
      const at = home && posRangeOf(home.sheet.layout, home.range);
      return home && at ? { sheet: { id: home.sheet.id }, ...at, a: 15 } : null;
    },
    table: (name) => {
      const order = own ? [own, ...list.filter((s) => s.id !== own.id)] : list;
      for (const s of order) {
        const table = s.layout.tables?.find((t) => sameTableName(t.name, name));
        if (table) return { sheet: handle(s), table };
      }
      return null;
    },
  };
}

// What a formula on one sheet may name of the workbook (docs/specs/029-sheets/formulas.md "References"): its own
// sheet, the others by title or id, and named ranges, as the compiler and the evaluator look them up.
import { posRangeOf } from '../layout';
import { nameHome } from '../range-names';
import type { Sheet } from '../sheet';
import type { SheetHandle, SheetsCtx } from '../formula/stored';

export function sheetsCtxOf(
  sheets: ReadonlyMap<string, Sheet>,
  sheetId: string,
  inputMax: number,
): SheetsCtx {
  const handle = (s: Sheet): SheetHandle => ({ id: s.id, title: s.title, layout: s.layout });
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
  };
}

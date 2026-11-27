// Named ranges (docs/specs/029-sheets/sheet.md "Named ranges", formulas.md "Named ranges", data-tools.md "Named ranges
// and named functions"): what a name may be, finding one on a sheet or across a tab's sheets, the workbook's names as
// its lists show them, and the writes a name's change makes. Names are kept as given and looked up case aside; each
// lives on the sheet whose cells it covers, unique in its workbook (D297).
import { formatRange, type GridRange } from './address';
import { posRangeOf } from './layout';
import { RANGE_NAME_MAX, RANGE_NAMES_MAX } from './limits';
import { quoteSheet } from './formula/stored';
import type { IdRange, RangeName, SheetLayout } from './sheet';
import type { SheetWrite } from './store';

export const NAME_TAKEN = 'Another named range is called that';

const NAME_SHAPE = /^[A-Za-z_][A-Za-z0-9_.]*$/;
// What a formula would read as a cell reference: A1 style (up to four letters, then a row, as the parser reads one)
// or R1C1 style.
export const CELL_LIKE = /^(?:[A-Za-z]{1,4}[0-9]+|[Rr][0-9]+[Cc][0-9]+)$/;

// Why `name` cannot name a range on `layout`, or null when it can: `others` are the workbook's other sheets' layouts,
// `except` the name being changed (taken off wherever it is).
export function rangeNameProblem(
  name: string,
  layout: SheetLayout,
  opts: { except?: string; others?: readonly SheetLayout[] } = {},
): string | null {
  const except = opts.except ?? '';
  const n = name.trim();
  if (n.length === 0 || n.length > RANGE_NAME_MAX || !NAME_SHAPE.test(n))
    return 'Names start with a letter or _, then letters, digits, _ or .';
  if (/^(true|false)$/i.test(n)) return 'TRUE and FALSE cannot be names';
  if (CELL_LIKE.test(n)) return 'That reads as a cell reference';
  const mine = (layout.names ?? []).filter((x) => !sameName(x.name, except));
  const taken = (l: SheetLayout) =>
    l.names?.some((x) => sameName(x.name, n) && !sameName(x.name, except));
  if (mine.some((x) => sameName(x.name, n)) || opts.others?.some(taken)) return NAME_TAKEN;
  if (mine.length >= RANGE_NAMES_MAX) return `A sheet holds up to ${RANGE_NAMES_MAX} names`;
  return null;
}

export const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function findRangeName(layout: SheetLayout, name: string): RangeName | undefined {
  return layout.names?.find((x) => sameName(x.name, name));
}

// The sheet a name reads (formulas.md "Named ranges"): the formula's own when it has it, else the one other sheet of
// the tab that does; none, or several, is null.
export function nameHome<S extends { id: string; layout: SheetLayout }>(
  name: string,
  own: S | undefined,
  tab: readonly S[],
): { sheet: S; range: RangeName } | null {
  const mine = own && findRangeName(own.layout, name);
  if (own && mine) return { sheet: own, range: mine };
  const hits = tab
    .filter((s) => s.id !== own?.id)
    .map((s) => ({ sheet: s, range: findRangeName(s.layout, name) }))
    .filter((x): x is { sheet: S; range: RangeName } => !!x.range);
  return hits.length === 1 ? hits[0]! : null;
}

// A name of the workbook as its lists show it: where it is, and its range as typed (`A1:B4` on the open sheet,
// `Sheet2!A1:B4` on another).
export type WorkbookNamedRange = { name: string; sheetId: string; range: GridRange; text: string };

// Every name of the workbook's sheets in name order, case aside; a name whose cells are gone is left out.
export function workbookNamedRanges(
  sheets: readonly { id: string; title: string; layout: SheetLayout }[],
  openId: string,
): WorkbookNamedRange[] {
  return sheets
    .flatMap((s) =>
      (s.layout.names ?? []).flatMap((x) => {
        const range = posRangeOf(s.layout, x);
        if (!range) return [];
        const at = formatRange(range);
        const text = s.id === openId ? at : `${quoteSheet(s.title)}!${at}`;
        return [{ name: x.name, sheetId: s.id, range, text }];
      }),
    )
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

// A name made or changed: `was` the name it had and its sheet (none for a new one), then the name, sheet and cells.
export type NamedRangeEdit = {
  was?: { name: string; sheetId: string };
  name: string;
  sheetId: string;
  range: IdRange;
};

// The writes an edit makes, one change: on its sheet the old name off then the new one on; moved to another sheet,
// taken off the one and put on the other.
export function namedRangeWrites(edit: NamedRangeEdit): { sheetId: string; write: SheetWrite }[] {
  const put = { k: 'name' as const, name: edit.name, range: edit.range };
  const { was } = edit;
  if (!was) return [{ sheetId: edit.sheetId, write: { kind: 'layout', changes: [put] } }];
  const off = { k: 'name' as const, name: was.name, range: null };
  if (was.sheetId === edit.sheetId)
    return [{ sheetId: edit.sheetId, write: { kind: 'layout', changes: [off, put] } }];
  return [
    { sheetId: was.sheetId, write: { kind: 'layout', changes: [off] } },
    { sheetId: edit.sheetId, write: { kind: 'layout', changes: [put] } },
  ];
}

// A copied sheet's layout: in a spreadsheet its names stay with the original, being the workbook's (D298); its
// protections stay behind always (data-tools.md "Protected ranges", D348).
export function layoutForCopy(layout: SheetLayout, inSpreadsheet: boolean): SheetLayout {
  if (!layout.protections && (!inSpreadsheet || !layout.names)) return layout;
  const { names, protections: _protections, ...rest } = layout;
  return inSpreadsheet || !names ? rest : { ...rest, names };
}

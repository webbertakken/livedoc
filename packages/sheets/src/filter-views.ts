// Filter views (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers", D469-D474): named filters
// of the sheet's that change only what the person who opens one sees. The sheet keeps them in its layout
// (`filterViews`), each set whole or removed by its id; which one is open is each person's own.
import { currentRegion, type Grid } from './selection';
import { isAxisId, makeAxisIds, type Rand } from './ids';
import { idRangeOf } from './layout';
import { isFilterCondition } from './filter';
import type { GridRange } from './address';
import type { FilterCondition, IdRange, SheetFilter, SheetLayout } from './sheet';
import { WORKBOOK_COLS_MAX } from './workbook/workbook-limits';

/** One key of a view's sort: a column by id, Z to A when `desc`. */
export type FilterViewSortKey = { c: string; desc?: true };

/** What a group by view groups (data-tools.md "Group by view"): its table and the column, by ids. */
export type FilterViewGroup = { t: string; c: string };

export type SheetFilterView = IdRange & {
  id: string;
  title: string;
  conds: Record<string, FilterCondition>;
  // Its sort keys in order; absent when it sorts nothing.
  sort?: FilterViewSortKey[];
  // A group by view's table and column; absent for a filter view.
  group?: FilterViewGroup;
};

// D440: up to 50 a sheet, as tables and slicers. D473: a name up to 100 characters.
export const FILTER_VIEWS_MAX = 50;
export const FILTER_VIEW_TITLE_MAX = 100;
// A view's sort keys: one a column, at most a spreadsheet's widest sheet.
const SORT_KEYS_MAX = WORKBOOK_COLS_MAX;

/** The names new views take: an Editor's saved views, and a Participant's or a Viewer's own (D470, D471, D498). */
export const FILTER_VIEW_PREFIX = {
  saved: 'Filter',
  temporary: 'Temporary Filter',
  group: 'Group',
  temporaryGroup: 'Temporary Group',
} as const;

const KEYS = new Set(['id', 'title', 'r1', 'c1', 'r2', 'c2', 'conds', 'sort', 'group']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Whether a name may be a view's: some text, within the limit. */
export function filterViewTitleOk(title: unknown): title is string {
  return typeof title === 'string' && title.trim() !== '' && title.length <= FILTER_VIEW_TITLE_MAX;
}

function isSortKey(v: unknown): v is FilterViewSortKey {
  return (
    isRecord(v) &&
    Object.keys(v).every((k) => k === 'c' || k === 'desc') &&
    isAxisId(v.c) &&
    (v.desc === undefined || v.desc === true)
  );
}

function isGroup(v: unknown): v is FilterViewGroup {
  return isRecord(v) && Object.keys(v).length === 2 && isAxisId(v.t) && isAxisId(v.c);
}

/** Whether `v` is a view of this id, whole: as every viewer may open it, a malformed one is refused at the write. */
export function isSheetFilterView(
  v: unknown,
  id: string,
  // A custom formula's references (validate.ts isStoredRef), checked where a write is.
  refsOk: (refs: unknown[]) => boolean = () => true,
): v is SheetFilterView {
  if (!isRecord(v) || v.id !== id || !isAxisId(id)) return false;
  if (!Object.keys(v).every((k) => KEYS.has(k))) return false;
  if (![v.r1, v.c1, v.r2, v.c2].every(isAxisId) || !filterViewTitleOk(v.title)) return false;
  const { conds, sort, group } = v;
  if (group !== undefined && !isGroup(group)) return false;
  if (
    !isRecord(conds) ||
    Object.keys(conds).length > WORKBOOK_COLS_MAX ||
    !Object.entries(conds).every(([col, cond]) => isAxisId(col) && isFilterCondition(cond, refsOk))
  )
    return false;
  return (
    sort === undefined ||
    (Array.isArray(sort) &&
      sort.length > 0 &&
      sort.length <= SORT_KEYS_MAX &&
      sort.every(isSortKey))
  );
}

/** `<prefix> N`, the smallest N no view of the sheet is named (case aside). */
export function nextFilterViewTitle(taken: readonly string[], prefix: string): string {
  const names = new Set(taken.map((t) => t.toLowerCase()));
  for (let n = 1; ; n++) {
    const title = `${prefix} ${n}`;
    if (!names.has(title.toLowerCase())) return title;
  }
}

/** The view of this id the layout holds, or null. */
export function filterViewOf(layout: SheetLayout, id: string): SheetFilterView | null {
  return layout.filterViews?.find((x) => x.id === id) ?? null;
}

function freshViewId(layout: SheetLayout, rand: Rand): string {
  return makeAxisIds(1, rand, new Set((layout.filterViews ?? []).map((x) => x.id)))[0]!;
}

function viewOfFilter(
  id: string,
  title: string,
  filter: IdRange & { conds: SheetFilter['conds'] },
): SheetFilterView {
  const { r1, c1, r2, c2 } = filter;
  return { id, title, r1, c1, r2, c2, conds: { ...filter.conds } };
}

/**
 * Data › Create Filter View (D470): over the filter's range with its conditions when the sheet has a filter, else
 * over the filled block around the selection (the selection itself when more than one cell), with none; named
 * `<prefix> N`, the smallest free among `taken`. Null when the range holds no line of the sheet.
 */
export function createFilterView(
  layout: SheetLayout,
  sel: GridRange,
  grid: Grid,
  opts: { rand: Rand; prefix: string; taken: readonly string[] },
): SheetFilterView | null {
  const id = freshViewId(layout, opts.rand);
  const title = nextFilterViewTitle(opts.taken, opts.prefix);
  if (layout.filter) return viewOfFilter(id, title, layout.filter);
  const single = sel.r1 === sel.r2 && sel.c1 === sel.c2;
  const box = single ? currentRegion({ r: sel.r1, c: sel.c1 }, grid) : sel;
  const range = idRangeOf(layout, box.r1, box.c1, box.r2, box.c2);
  return range ? viewOfFilter(id, title, { ...range, conds: {} }) : null;
}

/** Data › Change View › Save as Filter View: the filter's range and conditions as a new saved view; null without one. */
export function saveFilterAsView(layout: SheetLayout, rand: Rand): SheetFilterView | null {
  if (!layout.filter) return null;
  const taken = (layout.filterViews ?? []).map((x) => x.title);
  return viewOfFilter(
    freshViewId(layout, rand),
    nextFilterViewTitle(taken, FILTER_VIEW_PREFIX.saved),
    layout.filter,
  );
}

/** The layout's views after one is set (in its place, else last) or removed. */
export function filterViewsWith(
  list: readonly SheetFilterView[] | undefined,
  id: string,
  view: SheetFilterView | null,
): SheetFilterView[] | undefined {
  const all = list ?? [];
  const at = all.findIndex((x) => x.id === id);
  const next =
    view === null
      ? all.filter((x) => x.id !== id)
      : at >= 0
        ? all.map((x, i) => (i === at ? view : x))
        : [...all, view];
  return next.length ? next : undefined;
}

/**
 * The views after rows and columns go: each range shrunk as the filter's (`shrink`), a gone column's condition and
 * sort key dropped; a view whose range all went goes.
 */
export function filterViewsAfterDelete(
  list: readonly SheetFilterView[],
  goneCols: ReadonlySet<string>,
  shrink: (r: IdRange) => IdRange | null,
): SheetFilterView[] | undefined {
  const next = list.flatMap((v): SheetFilterView[] => {
    const range = shrink(v);
    if (!range) return [];
    const conds = Object.fromEntries(Object.entries(v.conds).filter(([c]) => !goneCols.has(c)));
    const sort = v.sort?.filter((k) => !goneCols.has(k.c));
    // A group by view whose column went is a filter view over its range (D499).
    const group = v.group && !goneCols.has(v.group.c) ? v.group : undefined;
    const { sort: _sort, group: _group, ...rest } = v;
    const { r1, c1, r2, c2 } = range;
    return [
      {
        ...rest,
        r1,
        c1,
        r2,
        c2,
        conds,
        ...(sort?.length ? { sort } : {}),
        ...(group ? { group } : {}),
      },
    ];
  });
  return next.length ? next : undefined;
}

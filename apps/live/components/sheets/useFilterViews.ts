// Filter views on a sheet (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers", D469-D474): which
// one this person has open, kept for the session per sheet as the selection is, never sent; the filter drawn (the open
// view's in the sheet's place); and the view's changes: an Editor's saved view written, a temporary view the
// person's own. A group by view's collapsed groups are its opener's alone, kept for the session with the view (D497).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  filterViewAsDrawn,
  filterViewOf,
  FILTER_VIEW_PREFIX,
  nextFilterViewTitle,
  viewSortFor,
  viewSortRefusal,
  type DrawnFilter,
  type FilterCondition,
  type SheetFilterView,
  type SheetLayout,
  type SheetWrite,
} from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';
import { useLatest } from '@/hooks/ui/useLatest';

/** Said when the open view is gone: deleted by someone else, or named by a link after it was deleted (D474). */
export const FILTER_VIEW_DELETED = 'That filter view was deleted';

/** Said when rows are dragged by their numbers while a view draws its own order: their place is the sort's (D495). */
export const MOVE_ROWS_IN_SORTED_VIEW = 'Close the filter view to move rows';

/** The view open on a sheet: a saved one by id, or a temporary one held whole. */
export type OpenFilterView = { id: string } | { temp: SheetFilterView };

// The open view of each sheet for the session, as KEPT_SELECTIONS keeps its place (a remount keeps it).
const KEPT_VIEWS = new Map<string, OpenFilterView>();

// Each group by view's collapsed groups by key (group-by-view.ts groupKey), by sheet and view, for the session.
const KEPT_COLLAPSED = new Map<string, ReadonlySet<string>>();
const NONE_COLLAPSED: ReadonlySet<string> = new Set();

/** Forget every sheet's open view and collapsed groups (tests). */
export function forgetOpenFilterViews(): void {
  KEPT_VIEWS.clear();
  KEPT_COLLAPSED.clear();
}

export type FilterViews = {
  // The view open, as drawn (a saved view as the sheet holds it now); null with none.
  open: SheetFilterView | null;
  // Whether the open view is this person's temporary one.
  temporary: boolean;
  // The filter drawn: the open view, else the sheet's filter.
  drawn: DrawnFilter | null;
  // The temporary views' titles too, so a new one takes the next free name.
  takenTitles: readonly string[];
  openSaved: (id: string) => void;
  openTemporary: (view: SheetFilterView) => void;
  close: () => void;
  // The open view changed whole: written when saved, kept when temporary. False when refused.
  change: (view: SheetFilterView) => boolean;
  setCondition: (colId: string, cond: FilterCondition | null) => boolean;
  // The view's Sort A to Z / Z to A: the column its one key, drawing the rows in that order (data-tools.md "The drawn
  // order", D491). False when refused (a merge across its rows, said in a toast).
  sort: (colId: string, ascending: boolean) => boolean;
  // The open group by view's collapsed groups by key, and collapsing or expanding them, this person's alone (D497).
  collapsed: ReadonlySet<string>;
  setCollapsed: (keys: ReadonlySet<string>) => void;
};

export function useFilterViews(opts: {
  sheetId: string;
  layout: SheetLayout;
  write: (w: SheetWrite) => boolean;
  toast: (message: string) => void;
  // An Editor's views are saved; anyone else's changes stay theirs (D471).
  canShape: boolean;
}): FilterViews {
  const { sheetId, layout, write, canShape } = opts;
  const toast = useLatest(opts.toast);
  const [state, setState] = useState<{ sheetId: string; open: OpenFilterView | null }>(() => ({
    sheetId,
    open: KEPT_VIEWS.get(sheetId) ?? null,
  }));
  const kept = state.sheetId === sheetId ? state.open : (KEPT_VIEWS.get(sheetId) ?? null);
  const setOpen = useCallback(
    (open: OpenFilterView | null) => {
      if (open) KEPT_VIEWS.set(sheetId, open);
      else KEPT_VIEWS.delete(sheetId);
      setState({ sheetId, open });
    },
    [sheetId],
  );
  const saved = kept && 'id' in kept ? filterViewOf(layout, kept.id) : null;
  const gone = !!kept && 'id' in kept && !saved;
  const stored = kept && 'temp' in kept ? kept.temp : saved;
  // A group by view over its table's rows as they are now (D499).
  const open = useMemo(() => (stored ? filterViewAsDrawn(layout, stored) : null), [stored, layout]);
  const collapsedKey = open ? `${sheetId}:${open.id}` : null;
  const [collapsedNow, setCollapsedNow] = useState<{
    key: string | null;
    keys: ReadonlySet<string>;
  }>({ key: null, keys: NONE_COLLAPSED });
  const collapsed =
    collapsedNow.key === collapsedKey
      ? collapsedNow.keys
      : ((collapsedKey ? KEPT_COLLAPSED.get(collapsedKey) : undefined) ?? NONE_COLLAPSED);
  const setCollapsed = useCallback(
    (keys: ReadonlySet<string>) => {
      if (!collapsedKey) return;
      KEPT_COLLAPSED.set(collapsedKey, keys);
      setCollapsedNow({ key: collapsedKey, keys });
      debugLog('[sheet] groups collapsed', { sheetId, count: keys.size });
    },
    [collapsedKey, sheetId],
  );
  // A saved view someone else deleted closes, said once.
  useEffect(() => {
    if (!gone) return;
    debugLog('[sheet] filter view gone', { sheetId });
    KEPT_VIEWS.delete(sheetId);
    toast.current(FILTER_VIEW_DELETED);
  }, [gone, sheetId, toast]);
  const temporary = !!kept && 'temp' in kept;
  const change = useCallback(
    (view: SheetFilterView) => {
      if (temporary) {
        setOpen({ temp: view });
        return true;
      }
      // A saved view changed by someone who may not save it becomes their temporary copy (D471).
      if (!canShape) {
        const taken = (layout.filterViews ?? []).map((x) => x.title);
        setOpen({
          temp: { ...view, title: nextFilterViewTitle(taken, FILTER_VIEW_PREFIX.temporary) },
        });
        return true;
      }
      return write({ kind: 'layout', changes: [{ k: 'fview', id: view.id, view }] });
    },
    [temporary, setOpen, write, canShape, layout.filterViews],
  );
  const setCondition = useCallback(
    (colId: string, cond: FilterCondition | null) => {
      if (!open) return false;
      const conds = { ...open.conds };
      if (cond) conds[colId] = cond;
      else delete conds[colId];
      return change({ ...open, conds });
    },
    [open, change],
  );
  const sort = useCallback(
    (colId: string, ascending: boolean) => {
      if (!open) return false;
      const refused = viewSortRefusal(layout, open);
      if (refused) {
        debugLog('[sheet] view sort refused', { sheetId, reason: 'merge' });
        toast.current(refused);
        return false;
      }
      debugLog('[sheet] view sort', { sheetId, colId, ascending, temporary });
      return change(viewSortFor(open, colId, ascending));
    },
    [open, layout, sheetId, temporary, change, toast],
  );
  const takenTitles = useMemo(
    () => [
      ...(layout.filterViews ?? []).map((x) => x.title),
      ...(open && temporary ? [open.title] : []),
    ],
    [layout.filterViews, open, temporary],
  );
  return {
    open,
    temporary,
    drawn: open ?? layout.filter ?? null,
    takenTitles,
    openSaved: useCallback((id: string) => setOpen({ id }), [setOpen]),
    openTemporary: useCallback((view: SheetFilterView) => setOpen({ temp: view }), [setOpen]),
    close: useCallback(() => setOpen(null), [setOpen]),
    change,
    setCondition,
    sort,
    collapsed: open?.group ? collapsed : NONE_COLLAPSED,
    setCollapsed,
  };
}

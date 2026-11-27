// What acts on filter views (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers", D469-D474):
// Data › Create Filter View, Change View and Save as Filter View, and the view bar's Name, Range, Duplicate, Delete
// and Close. An Editor's views are written to the sheet; a Participant's or a Viewer's are their own, never sent.
import { useMemo } from 'react';
import {
  createFilterView,
  FILTER_VIEW_PREFIX,
  FILTER_VIEW_TITLE_MAX,
  filterViewTitleOk,
  formatRange,
  idRangeOf,
  makeAxisIds,
  nextFilterViewTitle,
  parseRangeText,
  posRangeOf,
  saveFilterAsView,
  type SheetFilterView,
} from '@livedoc/sheets';
import { track } from '@/lib/telemetry';
import { debugLog } from '@/lib/debug-log';
import type { SheetController } from './sheet-controller';

/** The view bar's words for a refused field (data-tools.md "The view bar"). */
export const FILTER_VIEW_COPY = {
  emptyName: 'Name the filter view',
  badRange: 'Type a range like A1:D20',
} as const;

export type FilterViewActions = {
  create: () => void;
  saveFilterAsView: () => void;
  open: (id: string) => void;
  close: () => void;
  // The bar's fields: null when changed, else why not (shown under the field).
  rename: (title: string) => string | null;
  setRange: (text: string) => string | null;
  duplicate: () => void;
  remove: () => void;
  // The open view's range as the bar shows it.
  rangeText: string;
};

const selected = (c: SheetController) => {
  const ranges = c.selectionNow().ranges;
  return ranges[ranges.length - 1]!;
};

export function useFilterViewActions(c: SheetController): FilterViewActions {
  const { filterViews: views, sheet } = c;
  const open = views.open;
  const rangeText = useMemo(() => {
    const p = open ? posRangeOf(sheet.layout, open) : null;
    return p ? formatRange(p) : '';
  }, [open, sheet.layout]);

  // A new view: an Editor's written then opened; anyone else's opened as their own.
  const place = (view: SheetFilterView, how: 'create' | 'duplicate' | 'save') => {
    if (!c.canShape) {
      views.openTemporary(view);
      track('Spreadsheet', 'Added', 'TemporaryFilterView');
      debugLog('[sheet] filter view opened', { how, temporary: true });
      return;
    }
    if (!c.write({ kind: 'layout', changes: [{ k: 'fview', id: view.id, view }] }, 'Filter'))
      return;
    views.openSaved(view.id);
    track('Spreadsheet', 'Added', 'FilterView');
    debugLog('[sheet] filter view made', { how, conds: Object.keys(view.conds).length });
  };

  return {
    rangeText,
    create: () => {
      const view = createFilterView(sheet.layout, selected(c), c.grid, {
        rand: Math.random,
        prefix: c.canShape ? FILTER_VIEW_PREFIX.saved : FILTER_VIEW_PREFIX.temporary,
        taken: views.takenTitles,
      });
      if (!view) {
        debugLog('[sheet] filter view refused', { reason: 'range' });
        return;
      }
      place(view, 'create');
    },
    saveFilterAsView: () => {
      const view = c.canShape ? saveFilterAsView(sheet.layout, Math.random) : null;
      if (view) place(view, 'save');
    },
    open: (id) => {
      views.openSaved(id);
      debugLog('[sheet] filter view opened', { temporary: false });
    },
    close: () => {
      views.close();
      c.focusGrid();
    },
    rename: (title) => {
      if (!open) return null;
      const name = title.trim().slice(0, FILTER_VIEW_TITLE_MAX);
      if (!filterViewTitleOk(name)) return FILTER_VIEW_COPY.emptyName;
      if (name !== open.title) views.change({ ...open, title: name });
      return null;
    },
    setRange: (text) => {
      if (!open) return null;
      const p = parseRangeText(text);
      // A header row and a row under it, as Create a Filter's range.
      const ids = p && p.r2 > p.r1 ? idRangeOf(sheet.layout, p.r1, p.c1, p.r2, p.c2) : null;
      if (!ids) return FILTER_VIEW_COPY.badRange;
      const cols = new Set(sheet.layout.cols.slice(p!.c1, p!.c2 + 1));
      const conds = Object.fromEntries(Object.entries(open.conds).filter(([col]) => cols.has(col)));
      views.change({ ...open, ...ids, conds });
      return null;
    },
    duplicate: () => {
      if (!open) return;
      const [id] = makeAxisIds(
        1,
        Math.random,
        new Set((sheet.layout.filterViews ?? []).map((x) => x.id)),
      );
      const prefix = c.canShape ? `Copy of ${open.title}` : null;
      const title = prefix
        ? prefix.slice(0, FILTER_VIEW_TITLE_MAX)
        : nextFilterViewTitle(views.takenTitles, FILTER_VIEW_PREFIX.temporary);
      place({ ...open, id: id!, title }, 'duplicate');
    },
    remove: () => {
      if (!open || views.temporary || !c.canShape) return;
      views.close();
      if (c.write({ kind: 'layout', changes: [{ k: 'fview', id: open.id, view: null }] }, 'Filter'))
        debugLog('[sheet] filter view deleted', {});
      c.focusGrid();
    },
  };
}

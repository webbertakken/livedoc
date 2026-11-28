// Data › Create Filter View, Create Group by View and Change View's items (docs/specs/029-sheets/data-tools.md
// "Filters, filter views and slicers", "Group by view"), bound to the open sheet's filter view actions: Create Group by
// View dimmed with its note while the active cell is in no table; each view by name, ticked when open; Close View while
// one is; Save as Filter View an Editor's, with the sheet's filter on.
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { filterViewItemId } from '@/lib/spreadsheet/spreadsheet-menus';
import { GROUP_VIEW_NEEDS_TABLE, type SheetFilterView, type SheetLayout } from '@livedoc/sheets';
import type { FilterViewActions } from './useFilterViewActions';

/** Data › Change View's names, or null while the sheet has no view, no filter and none open (the submenu hidden). */
export function changeViewTitles(
  layout: SheetLayout,
  open: SheetFilterView | null,
): readonly string[] | null {
  const views = layout.filterViews ?? [];
  return views.length || layout.filter || open ? views.map((x) => x.title) : null;
}

export function filterViewMenuActions(at: {
  layout: SheetLayout;
  open: SheetFilterView | null;
  canShape: boolean;
  // Whether the active cell is in a table, so a group by view can be made of it.
  inTable: boolean;
  run: () => FilterViewActions;
}): OfficeActions {
  const { layout, open, canShape, run } = at;
  const views = layout.filterViews ?? [];
  return {
    'create-filter-view': { run: () => run().create() },
    'create-group-by-view': {
      run: () => run().createGroup(),
      ...(at.inTable ? {} : { disabled: true, note: GROUP_VIEW_NEEDS_TABLE }),
    },
    ...Object.fromEntries(
      views.map((v, i) => [
        filterViewItemId(i),
        { run: () => run().open(v.id), checked: open?.id === v.id },
      ]),
    ),
    'close-filter-view': { run: () => run().close(), disabled: !open },
    ...(canShape
      ? { 'save-as-filter-view': { run: () => run().saveFilterAsView(), disabled: !layout.filter } }
      : {}),
  };
}

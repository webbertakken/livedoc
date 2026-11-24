'use client';

// The open sheet's menu bindings (docs/specs/029-sheets/surface.md "Menu bar", "Context menus"): the grid's actions and
// clipboard, its selection and the active cell's look, put to the menus' items and published up to the title row,
// with the sheet bar's Insert › Sheet; the grid's own context menus run the same bindings.
import {
  gridMenuOutline,
  gridOffice,
  sheetBarBindings,
  type GridOffice,
} from '@/lib/spreadsheet/spreadsheet-menu-bindings';
import { openHyperlink } from '@/lib/open-hyperlink';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { useSheetClipboard } from '@/components/sheets/useSheetClipboard';
import { usePublishedBindings } from './office-bindings-channel';
import { useSheetBarActionsContext } from './useSheetBarActions';

export function useGridMenuBindings(actions: SheetActions): GridOffice {
  const c = useSheetController();
  const clip = useSheetClipboard();
  const bar = useSheetBarActionsContext();
  const { selection, sheet } = c;
  const { layout } = sheet;
  const range = selection.ranges[selection.ranges.length - 1]!;
  const link = c.workbook.hyperlinkOf(sheet.id, selection.active.r, selection.active.c);
  const office = gridOffice({
    canWrite: c.canEdit,
    canShape: c.canShape,
    range,
    active: selection.active,
    rows: layout.rows.length,
    cols: layout.cols.length,
    format: actions.activeFormat(),
    frozenRows: layout.frozenRows ?? 0,
    frozenCols: layout.frozenCols ?? 0,
    showGrid: layout.showGrid !== false,
    filtered: !!layout.filter,
    outline: gridMenuOutline(c.viewLayout, range),
    link,
    act: {
      ...actions,
      cut: () => clip.copyNow(true),
      copy: () => clip.copyNow(false),
      paste: () => void clip.pasteNow(),
      pasteSpecial: (mode) => void clip.pasteSpecial(mode),
      hide: (axis) => actions.hide(axis, true),
      resize: (axis, from, to) => c.setMenu({ kind: 'resize', axis, from, to }),
      openLink: openHyperlink,
    },
  });
  const published = { ...office, actions: { ...office.actions, ...sheetBarBindings(bar) } };
  usePublishedBindings(published);
  return published;
}

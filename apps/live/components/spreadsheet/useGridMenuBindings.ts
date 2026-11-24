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
import { useMemo } from 'react';
import { unmergeRange, type MergeMode } from '@livedoc/sheets';
import { openHyperlink } from '@/lib/open-hyperlink';
import { recentFormatCodes } from '@/lib/spreadsheet/recent-formats';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { useSheetClipboard } from '@/components/sheets/useSheetClipboard';
import { usePublishedBindings } from './office-bindings-channel';
import { useBorderLine } from './border-line-context';
import { useSheetBarActionsContext } from './useSheetBarActions';

/** The dialogs the open sheet hosts that its menu items open, and the merge that asks first (useMergeDialog). */
export type GridDialogs = {
  openCustomFormat: () => void;
  openCustomCurrency: () => void;
  openCustomDateTime: () => void;
  merge: (mode: MergeMode) => void;
};

export function useGridMenuBindings(actions: SheetActions, dialogs: GridDialogs): GridOffice {
  const c = useSheetController();
  const [borderLine, chooseBorderLine] = useBorderLine();
  const clip = useSheetClipboard();
  const bar = useSheetBarActionsContext();
  const { selection, sheet } = c;
  const { layout } = sheet;
  const range = selection.ranges[selection.ranges.length - 1]!;
  const link = c.workbook.hyperlinkOf(sheet.id, selection.active.r, selection.active.c);
  // One pass over the open sheet's cells per change of it (D194).
  const recentCodes = useMemo(() => recentFormatCodes(sheet.cells.values()), [sheet]);
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
    recentCodes,
    merged: unmergeRange(sheet, range) !== null,
    borderLine,
    chooseBorderLine,
    act: {
      ...actions,
      cut: () => clip.copyNow(true),
      copy: () => clip.copyNow(false),
      paste: () => void clip.pasteNow(),
      pasteSpecial: (mode) => void clip.pasteSpecial(mode),
      hide: (axis) => actions.hide(axis, true),
      resize: (axis, from, to) => c.setMenu({ kind: 'resize', axis, from, to }),
      openLink: openHyperlink,
      openCustomFormat: dialogs.openCustomFormat,
      openCustomCurrency: dialogs.openCustomCurrency,
      openCustomDateTime: dialogs.openCustomDateTime,
      merge: dialogs.merge,
    },
  });
  const published = { ...office, actions: { ...office.actions, ...sheetBarBindings(bar) } };
  usePublishedBindings(published);
  return published;
}

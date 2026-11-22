'use client';

// The open sheet's menu bindings (docs/specs/029-sheets/surface.md "Menu bar"): the grid's actions and clipboard, its
// selection and the active cell's look, put to the menus' items and published up to the title row.
import { gridMenuBindings } from '@/lib/spreadsheet/spreadsheet-menu-bindings';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { useSheetClipboard } from '@/components/sheets/useSheetClipboard';
import { usePublishedBindings } from './office-bindings-channel';

export function useGridMenuBindings(actions: SheetActions): void {
  const c = useSheetController();
  const clip = useSheetClipboard();
  const { selection, sheet } = c;
  const { layout } = sheet;
  usePublishedBindings(
    gridMenuBindings({
      canWrite: c.canEdit,
      canShape: c.canShape,
      range: selection.ranges[selection.ranges.length - 1]!,
      active: selection.active,
      rows: layout.rows.length,
      cols: layout.cols.length,
      format: actions.activeFormat(),
      frozenRows: layout.frozenRows ?? 0,
      frozenCols: layout.frozenCols ?? 0,
      showGrid: layout.showGrid !== false,
      filtered: !!layout.filter,
      act: {
        ...actions,
        cut: () => clip.copyNow(true),
        copy: () => clip.copyNow(false),
        paste: () => void clip.pasteNow(),
        pasteSpecial: (mode) => void clip.pasteSpecial(mode),
      },
    }),
  );
}

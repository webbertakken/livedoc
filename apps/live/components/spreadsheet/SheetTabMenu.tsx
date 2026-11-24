'use client';

// A sheet tab's menu (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar"): Google's items in Google's
// order, opened by the tab's arrow, a right-click, Shift+F10 or the context menu key. Only an Editor changes the
// sheets; for anyone else, and for what is not built yet, an item stays in its place, dimmed (D174).
import { ContextMenu, ContextMenuDivider } from '@/components/palette/ContextMenu';
import { MenuActionRow, MenuHeader } from '@/components/primitives/PortalMenu';
import { Glyph } from '@/components/sheets/SheetCellMenu';
import type { SheetBarActions } from './useSheetBarActions';

export type SheetTabMenuAt = { tabId: string; x: number; y: number; fromBar: boolean };

export function SheetTabMenu({
  at,
  name,
  sheetCount,
  actions,
  onClose,
}: {
  at: SheetTabMenuAt;
  name: string;
  // The workbook's sheets: the last one is never deleted.
  sheetCount: number;
  actions: SheetBarActions;
  onClose: () => void;
}) {
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const can = actions.canChange;
  const later = (label: string, t: string) => (
    // Dimmed, it never runs: its click is the menu's own close.
    <MenuActionRow label={label} icon={<Glyph t={t} />} disabled onClick={onClose} />
  );
  return (
    <ContextMenu
      position={{ x: at.x, y: at.y }}
      label={`${name} menu`}
      onClose={onClose}
      anchorBottom={at.fromBar}
    >
      <MenuHeader title={name} />
      <MenuActionRow
        label="Delete"
        icon={<Glyph t="−" />}
        disabled={!can || sheetCount <= 1}
        onClick={act(() => actions.remove(at.tabId))}
      />
      <MenuActionRow
        label="Duplicate"
        icon={<Glyph t="⧉" />}
        disabled={!can}
        onClick={act(() => actions.duplicate(at.tabId))}
      />
      {later('Copy To', '⇥')}
      <ContextMenuDivider />
      <MenuActionRow
        label="Rename"
        icon={<Glyph t="✎" />}
        disabled={!can}
        onClick={act(() => actions.startRename(at.tabId))}
      />
      {later('Change Colour', '◐')}
      <ContextMenuDivider />
      {later('Protect Sheet', '⚿')}
      {later('Hide Sheet', '◌')}
      {later('View Comments', '✉')}
      <ContextMenuDivider />
      {later('Move Right', '→')}
      {later('Move Left', '←')}
    </ContextMenu>
  );
}

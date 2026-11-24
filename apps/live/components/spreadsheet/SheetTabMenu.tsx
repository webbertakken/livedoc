'use client';

// A sheet tab's menu (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar"): Google's items in Google's
// order, opened by the tab's arrow, a right-click, Shift+F10 or the context menu key. Only an Editor changes the
// sheets; for anyone else, and for what is not built yet, an item stays in its place, dimmed (D174). Protect Sheet waits
// for Protected Sheets and Ranges (plan 0020 Phase 10).
import { ContextMenu, ContextMenuDivider } from '@/components/palette/ContextMenu';
import { MenuActionRow, MenuHeader } from '@/components/primitives/PortalMenu';
import { Glyph } from '@/components/sheets/SheetCellMenu';
import type { SheetBarActions } from './useSheetBarActions';

export type SheetTabMenuAt = { tabId: string; x: number; y: number; fromBar: boolean };

export function SheetTabMenu({
  at,
  name,
  shownCount,
  index,
  actions,
  onColour,
  onClose,
}: {
  at: SheetTabMenuAt;
  name: string;
  // The sheets the bar shows: the last one shown is never deleted or hidden.
  shownCount: number;
  // The tab's place among them: Move Left dims on the first, Move Right on the last (D181).
  index: number;
  actions: SheetBarActions;
  // Change Colour: the bar opens the colour picker on the tab.
  onColour: () => void;
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
        disabled={!can || shownCount <= 1}
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
      <MenuActionRow
        label="Change Colour"
        icon={<Glyph t="◐" />}
        disabled={!can}
        onClick={act(onColour)}
      />
      <ContextMenuDivider />
      {later('Protect Sheet', '⚿')}
      <MenuActionRow
        label="Hide Sheet"
        icon={<Glyph t="◌" />}
        disabled={!can || shownCount <= 1}
        onClick={act(() => actions.hide(at.tabId))}
      />
      {later('View Comments', '✉')}
      <ContextMenuDivider />
      <MenuActionRow
        label="Move Right"
        icon={<Glyph t="→" />}
        disabled={!can || index >= shownCount - 1}
        onClick={act(() => actions.moveBy(at.tabId, 1))}
      />
      <MenuActionRow
        label="Move Left"
        icon={<Glyph t="←" />}
        disabled={!can || index <= 0}
        onClick={act(() => actions.moveBy(at.tabId, -1))}
      />
    </ContextMenu>
  );
}

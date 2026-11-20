'use client';

// The office shell's context menu (docs/specs/004-interface-design/office-shell.md "Context menus"): the kind's entries
// for the place pressed, drawn as an open menu of the menu bar, at the point (or the caret), kept inside the window.
// Focus starts on its first item and goes back to the document as it closes.
import type { OfficeActions, OfficeEntry } from '@/lib/office/office-catalogue';
import type { Point } from '@/lib/office/context-menu-place';
import type { ShortcutText } from '@/lib/office/shortcut-notation';
import { OfficeMenuPanel } from './OfficeMenuPanel';

// What a kind hands the shell for its document's context menu.
export type OfficeContextMenuSource = {
  // The entries for text; the session's level and bindings filter them as the menus' are.
  entries: readonly OfficeEntry[];
  // Where the caret is on screen, for a menu opened from the keyboard; null with no caret.
  caretPoint: () => Point | null;
  // A right-click outside the selection moves the caret there first.
  placeCaret: (point: Point) => void;
};

export function OfficeContextMenu({
  entries,
  at,
  actions,
  shortcutOf,
  onClose,
}: {
  entries: readonly OfficeEntry[];
  at: Point;
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
  onClose: () => void;
}) {
  return (
    <OfficeMenuPanel
      entries={entries}
      actions={actions}
      shortcutOf={shortcutOf}
      trigger={null}
      initialFocus="first"
      placement="point"
      at={at}
      label="Context menu"
      onClose={onClose}
      onDone={onClose}
    />
  );
}

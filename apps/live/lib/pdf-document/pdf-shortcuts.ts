// A PDF document's keyboard shortcuts (docs/specs/035-pdf-documents/keyboard-shortcuts.md), as the office shell's
// registry. The shell's own rows (the tool finder, the menus' access keys, the shortcuts dialog) and the two modes a
// PDF shares with a text document keep the text document's keys, so one habit serves both kinds
// (editing-modes.md "Switching"). The tools' single keys are the surface's own: they must not fire in a text field.
import type { ShortcutRow } from '@/lib/office/shortcut-registry';
import { TEXT_DOCUMENT_SHORTCUTS } from '@/lib/text-document/text-document-shortcuts';

const SHARED = new Set([
  'tool-finder',
  'show-common-keyboard-shortcuts',
  'file-menu',
  'edit-menu',
  'view-menu',
  'tools-menu',
  'help-menu',
  'switch-to-editing',
  'switch-to-viewing',
]);

const MODES = 'Editing modes';

export const PDF_SHORTCUTS: readonly ShortcutRow[] = [
  ...TEXT_DOCUMENT_SHORTCUTS.filter((row) => SHARED.has(row.id)).map((row) =>
    row.id.startsWith('switch-to-') ? { ...row, group: MODES } : row,
  ),
  {
    id: 'switch-to-reviewing',
    group: MODES,
    action: 'Switch to reviewing',
    keys: {
      pc: 'Ctrl+Alt+Shift+X',
      mac: '⌘+Option+Shift+X',
      chromeos: 'Ctrl+Alt+Shift+X',
    },
    status: 'built',
  },
];

/** The tools' own keys, heard on the pages and never in a text field ("Tools"). */
export const PDF_TOOL_KEYS = { select: 'v', highlight: 'u' } as const;

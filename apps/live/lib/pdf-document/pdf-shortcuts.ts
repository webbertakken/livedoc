// A PDF document's keyboard shortcuts (docs/specs/035-pdf-documents/keyboard-shortcuts.md), as the office shell's
// registry. The shell's own rows (the tool finder, the menus' access keys, the shortcuts dialog) and the two modes a
// PDF shares with a text document keep the text document's keys, so one habit serves both kinds
// (editing-modes.md "Switching"). The tools' single keys are the surface's own: they must not fire in a text field.
import type { ShortcutRow } from '@/lib/office/shortcut-registry';
import { TEXT_DOCUMENT_SHORTCUTS } from '@/lib/text-document/text-document-shortcuts';
import { COPY, SELECT_ALL } from './pdf-menus';

const SHARED = new Set([
  'undo',
  'redo',
  'tool-finder',
  'show-common-keyboard-shortcuts',
  'file-menu',
  'edit-menu',
  'view-menu',
  'insert-menu',
  'format-menu',
  'tools-menu',
  'help-menu',
  'switch-to-editing',
  'switch-to-viewing',
]);

const MODES = 'Editing modes';
const READING_GROUP = 'Reading';

const reading = (id: string, action: string, pc: string, mac: string): ShortcutRow => ({
  id,
  group: READING_GROUP,
  action,
  keys: { pc, mac, chromeos: pc },
  status: 'built',
});

/** The keys a page is read by (keyboard-shortcuts.md "Reading"). The ones bound to a menu item share its id; the plain
 *  keys are the pages' own, heard there and never in a field, so their rows only list them (`PDF_PAGE_KEYS`). */
const READING: readonly ShortcutRow[] = [
  reading('scroll-keys', 'Scroll up, down', 'Up or Down', 'Up or Down'),
  reading(
    'screen-keys',
    'Previous screen, next screen',
    'PgUp or Shift+Space or PgDn or Space',
    'PgUp or Shift+Space or PgDn or Space',
  ),
  reading('page-keys', 'Previous page, next page', 'Left or Right', 'Left or Right'),
  reading('end-keys', 'First page, last page', 'Home or End', 'Home or End'),
  reading('go-to-page', 'Go to page', 'Ctrl+Alt+G', '⌘+Option+G'),
  reading('zoom-in', 'Zoom in', 'Ctrl+Plus', '⌘+Plus'),
  reading('zoom-out', 'Zoom out', 'Ctrl+-', '⌘+-'),
  reading('zoom-actual-size', 'Actual size', 'Ctrl+1', '⌘+1'),
  reading('zoom-fit-page', 'Fit page', 'Ctrl+0', '⌘+0'),
  reading('zoom-fit-width', 'Fit width', 'Ctrl+2', '⌘+2'),
  reading('rotate-view-clockwise', 'Rotate view clockwise', 'Ctrl+Shift+Plus', '⌘+Shift+Plus'),
  reading(
    'rotate-view-counterclockwise',
    'Rotate view counterclockwise',
    'Ctrl+Shift+-',
    '⌘+Shift+-',
  ),
];

/** Not a menu item's: the surface binds it under this id (keyboard-shortcuts.md "Panels"). */
export const OPEN_LEFT_PANEL = 'open-left-panel';

/** The panels' keys (keyboard-shortcuts.md "Panels"); ⌘⇧F5, Acrobat's, is the browser's reload. */
const PANELS: readonly ShortcutRow[] = [
  {
    id: OPEN_LEFT_PANEL,
    group: 'Panels',
    action: 'Open the left panel and focus it',
    keys: { pc: 'Ctrl+Alt+Shift+T', mac: '⌘+Option+Shift+T', chromeos: 'Ctrl+Alt+Shift+T' },
    status: 'built',
  },
];

/** Copy and Select all (keyboard-shortcuts.md "Selections, marks and comments"): the surface hears them itself, ⌘C
 *  outside a field with text selected and ⌘A on the pages, so a field keeps its own. */
const SELECTIONS: readonly ShortcutRow[] = [
  {
    id: COPY,
    group: 'Selections, marks and comments',
    action: 'Copy',
    keys: { pc: 'Ctrl+C', mac: '⌘+C', chromeos: 'Ctrl+C' },
    status: 'surface',
  },
  {
    id: SELECT_ALL,
    group: 'Selections, marks and comments',
    action: 'Select all',
    keys: { pc: 'Ctrl+A', mac: '⌘+A', chromeos: 'Ctrl+A' },
    status: 'surface',
  },
];

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
  // The Pages menu, which a text document has none of (keyboard-shortcuts.md "Rules").
  {
    id: 'pages-menu',
    group: 'Menus',
    action: 'Pages menu',
    keys: {
      pc: 'Alt+P (Chrome) or Alt+Shift+P (other browsers)',
      mac: 'Ctrl+Option+P',
      chromeos: 'Alt+P',
    },
    status: 'built',
  },
  ...READING,
  ...PANELS,
  ...SELECTIONS,
];

/** The tools' own keys, heard on the pages and never in a text field ("Tools"). */
export const PDF_TOOL_KEYS = { select: 'v', highlight: 'u' } as const;

/** The pages' own plain keys (keyboard-shortcuts.md "Reading"), by `KeyboardEvent.key`. */
export const PDF_PAGE_KEYS = {
  previousPage: 'ArrowLeft',
  nextPage: 'ArrowRight',
  firstPage: 'Home',
  lastPage: 'End',
} as const;

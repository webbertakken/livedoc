// The spreadsheet's shortcut registry (docs/specs/004-interface-design/office-shell.md "Shortcut layer";
// docs/specs/029-sheets/surface.md "Menu bar"): the keys the shell runs itself, the tool finder and each menu's Alt key,
// in Google's words for PC, Mac and ChromeOS. The grid hears its own keys (sheet-keys.ts) until they join this
// registry, so none of them is here and none is taken from it.
import type { ShortcutRow } from '@/lib/office/shortcut-registry';

const menuRow = (menu: string, letter: string): ShortcutRow => ({
  id: `${menu.toLowerCase()}-menu`,
  group: 'Menus',
  action: `${menu} menu`,
  keys: {
    pc: `Alt+${letter} (Chrome) or Alt+Shift+${letter} (other browsers)`,
    mac: `Ctrl+Option+${letter}`,
    chromeos: `Alt+${letter}`,
  },
  status: 'built',
});

export const SPREADSHEET_SHORTCUTS: readonly ShortcutRow[] = [
  {
    id: 'tool-finder',
    group: 'Common actions',
    action: 'Search the menus',
    keys: { pc: 'Alt+/', mac: 'Option+/', chromeos: 'Alt+/' },
    status: 'built',
  },
  menuRow('File', 'F'),
  menuRow('Edit', 'E'),
  menuRow('View', 'V'),
  menuRow('Insert', 'I'),
  menuRow('Format', 'O'),
  menuRow('Data', 'D'),
  menuRow('Tools', 'T'),
  menuRow('Help', 'H'),
];

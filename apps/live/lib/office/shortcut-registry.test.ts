import { describe, expect, it } from 'vitest';
import { shortcutListing, type ShortcutRow } from './shortcut-registry';
import { everyWordStarts } from './word-match';

const row = (
  id: string,
  group: string,
  action: string,
  pc: string,
  mac: string,
  status: ShortcutRow['status'] = 'built',
): ShortcutRow => ({ id, group, action, keys: { pc, mac, chromeos: pc }, status });

const ROWS: ShortcutRow[] = [
  row('undo', 'Common actions', 'Undo', 'Ctrl+Z', '⌘+Z'),
  row('zoom-in', 'Common actions', 'Zoom in', 'Ctrl+Plus', '⌘+Plus', 'browser'),
  row('voice', 'Common actions', 'Voice typing', 'Ctrl+Shift+S', '⌘+Shift+S', 'leftOut'),
  row('bold', 'Text formatting', 'Bold', 'Ctrl+B', '⌘+B', 'specified'),
  row('finder', 'Menus', 'Tool finder', 'Alt+/ or Alt+Z (Chrome)', 'Option+/'),
  row('repeat', 'Menus', 'Repeat last action', 'Ctrl+Y', '—'),
  row('word', 'Text selection with the mouse', 'Select a word', 'Double-click', 'Double-click'),
];

const PC_CHROME = { platform: 'pc', chrome: true } as const;

// docs/specs/004-interface-design/office-shell.md "Keyboard shortcuts dialog".
describe('shortcutListing', () => {
  it('lists every row by group in the registry order, leaving out what is left out (C3)', () => {
    const { groups, count } = shortcutListing(ROWS, PC_CHROME, '');
    expect(groups.map((g) => g.name)).toEqual([
      'Common actions',
      'Text formatting',
      'Menus',
      'Text selection with the mouse',
    ]);
    expect(groups[0]!.rows.map((r) => r.action)).toEqual(['Undo', 'Zoom in']);
    expect(count).toBe(6);
  });

  it('shows every way on this platform and browser, in its notation', () => {
    const finder = (chrome: boolean) =>
      shortcutListing(ROWS, { platform: 'pc', chrome }, 'tool').groups[0]!.rows[0]!.ways;
    expect(finder(true)).toEqual(['Alt+/', 'Alt+Z']);
    expect(finder(false)).toEqual(['Alt+/']);
    const mac = shortcutListing(ROWS, { platform: 'mac', chrome: true }, 'undo');
    expect(mac.groups[0]!.rows[0]!.ways).toEqual(['⌘Z']);
  });

  it('leaves out a row with no way on this platform', () => {
    const mac = shortcutListing(ROWS, { platform: 'mac', chrome: true }, '');
    expect(mac.groups.flatMap((g) => g.rows.map((r) => r.id))).not.toContain('repeat');
  });

  it("marks a row not yet built as coming soon, and the browser's as working", () => {
    const rows = shortcutListing(ROWS, PC_CHROME, '').groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.id === 'bold')!.comingSoon).toBe(true);
    expect(rows.find((r) => r.id === 'zoom-in')!.comingSoon).toBe(false);
    expect(rows.find((r) => r.id === 'undo')!.comingSoon).toBe(false);
  });

  it('shows a pointer gesture as written', () => {
    const { groups } = shortcutListing(ROWS, PC_CHROME, 'select word');
    expect(groups[0]!.rows[0]!.ways).toEqual(['Double-click']);
  });

  it('filters by words that start a word of the action or the group, dropping empty groups', () => {
    expect(
      shortcutListing(ROWS, PC_CHROME, 'zo').groups.flatMap((g) => g.rows.map((r) => r.id)),
    ).toEqual(['zoom-in']);
    const byGroup = shortcutListing(ROWS, PC_CHROME, 'text form');
    expect(byGroup.groups.map((g) => g.name)).toEqual(['Text formatting']);
    expect(shortcutListing(ROWS, PC_CHROME, 'nothing here').count).toBe(0);
    expect(shortcutListing(ROWS, PC_CHROME, 'nothing here').groups).toEqual([]);
  });
});

describe('everyWordStarts', () => {
  it('matches each typed word to the start of a word, in any case', () => {
    expect(everyWordStarts('Zo in', 'Zoom in')).toBe(true);
    expect(everyWordStarts('oom', 'Zoom in')).toBe(false);
    expect(everyWordStarts('', 'anything')).toBe(true);
  });
});

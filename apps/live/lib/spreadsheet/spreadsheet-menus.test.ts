import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  catalogueFaults,
  catalogueItems,
  SHELL_BOUND_ITEMS,
  type OfficeEntry,
  type OfficeItem,
  type OfficeSubmenu,
} from '@/lib/office/office-catalogue';
import {
  CONVERT_ITEM_ID,
  DOWNLOAD_ITEMS,
  NUMBER_FORMAT_ITEMS,
  SHEET_DOWNLOAD_ITEMS,
  spreadsheetMenus,
} from './spreadsheet-menus';
import { SPREADSHEET_SHORTCUTS } from './spreadsheet-shortcuts';
import { ZOOM_ITEMS } from './spreadsheet-zoom';

// The parity matrix's menu rows (docs/specs/029-sheets/parity-matrix.md): each a menu, its words and its status.
const MATRIX = readFileSync(
  resolve(__dirname, '../../../../docs/specs/029-sheets/parity-matrix.md'),
  'utf8',
);
const ROWS = MATRIX.split('\n')
  .map((line) => line.split('|').map((cell) => cell.trim()))
  .filter((cells) => /^[A-Z][a-z]+ menu$/.test(cells[1] ?? ''))
  .map((cells) => ({ menu: cells[1]!.replace(' menu', ''), words: cells[2]!, status: cells[3]! }));

const MINOR = new Set([
  'a',
  'an',
  'and',
  'as',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'over',
  'the',
  'to',
  'with',
]);

// surface.md D125: the row's words before any parentheses, in Title Case.
const titleCase = (words: string) =>
  words
    .split(' ')
    .map((w, i) => (i > 0 && MINOR.has(w) ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ');
const headOf = (words: string) => titleCase(words.replace(/\s*\(.*$/, ''));

// D126: a row naming Google reads as LiveDoc's own.
const LIVEDOC_WORDS: Record<string, string> = { 'Sheets Help': 'Help' };

const labels = (entries: readonly OfficeEntry[]) =>
  entries.flatMap((e) => (e.kind === 'separator' ? [] : [e.label]));

describe('spreadsheetMenus', () => {
  const menus = spreadsheetMenus('ods');

  it('draws Google’s menus in order, Extensions left out (C3)', () => {
    expect(menus.map((m) => m.label)).toEqual([
      'File',
      'Edit',
      'View',
      'Insert',
      'Format',
      'Data',
      'Tools',
      'Help',
    ]);
  });

  it('holds one entry per planned matrix row, in its order, and none for a row left out (D125, D126)', () => {
    expect(ROWS.length).toBeGreaterThan(90);
    for (const menu of menus) {
      const rows = ROWS.filter((row) => row.menu === menu.label);
      const planned = rows
        .filter((row) => row.status !== 'left out (C3)')
        .map((row) => LIVEDOC_WORDS[headOf(row.words)] ?? headOf(row.words));
      // File › Convert is LiveDoc's own (files-and-print.md "Converting"), no row of Google's.
      const own = labels(
        menu.entries.filter((e) => e.kind === 'separator' || e.id !== CONVERT_ITEM_ID),
      );
      expect(own, menu.label).toEqual(planned);
      for (const row of rows.filter((r) => r.status === 'left out (C3)'))
        expect(own, row.words).not.toContain(headOf(row.words));
    }
  });

  it('makes a row listing choices a submenu of them (D125)', () => {
    const entry = (menu: string, label: string) =>
      menus
        .find((m) => m.label === menu)!
        .entries.find((e) => e.kind !== 'separator' && e.label === label) as OfficeSubmenu;
    expect(labels(entry('Edit', 'Paste Special').entries)).toEqual([
      'Values Only',
      'Format Only',
      'Formula Only',
      'Conditional Formatting Only',
      'Data Validation Only',
      'Transposed',
      'Column Widths Only',
      'All Except Borders',
    ]);
    const freeze = entry('View', 'Freeze').entries;
    expect(freeze.map((e) => (e.kind === 'separator' ? '-' : e.label))).toEqual([
      'No Rows',
      '1 Row',
      '2 Rows',
      'Up to Row',
      '-',
      'No Columns',
      '1 Column',
      '2 Columns',
      'Up to Column',
    ]);
    expect(labels(entry('Format', 'Number').entries)).toEqual([
      ...NUMBER_FORMAT_ITEMS.map((i) => i.label),
      'Custom Currency',
      'Custom Date and Time',
      'Custom Number Format',
    ]);
  });

  it('lists Download’s formats and names the format Convert goes to, an Editor’s', () => {
    const file = menus[0]!.entries;
    const download = file.find((e) => e.kind === 'submenu' && e.id === 'download') as OfficeSubmenu;
    expect(labels(download.entries)).toEqual([
      'Microsoft Excel (.xlsx)',
      'OpenDocument (.ods)',
      'Flat OpenDocument (.fods)',
      'PDF (.pdf)',
      'Web Page (.html, zipped)',
      'Comma-separated values (.csv, current sheet)',
      'Tab-separated values (.tsv, current sheet)',
    ]);
    expect(DOWNLOAD_ITEMS.map((i) => i.format)).toEqual(['xlsx', 'ods', 'fods']);
    expect(SHEET_DOWNLOAD_ITEMS.map((i) => i.format)).toEqual(['csv', 'tsv']);
    const convert = (format: 'ods' | 'fods' | 'xlsx') =>
      catalogueItems(spreadsheetMenus(format)).find(({ item }) => item.id === CONVERT_ITEM_ID)!
        .item;
    expect(convert('ods').label).toBe('Convert to Excel (.xlsx)');
    expect(convert('fods').label).toBe('Convert to Excel (.xlsx)');
    expect(convert('xlsx').label).toBe('Convert to OpenDocument (.ods)');
    expect(convert('xlsx').level).toBe('edit');
  });

  it('uses every id once and names only shortcuts its registry holds', () => {
    const items = catalogueItems(menus).map(({ item }) => item.id);
    expect(
      catalogueFaults(menus, { bound: items, shortcuts: SPREADSHEET_SHORTCUTS.map((r) => r.id) }),
    ).toEqual([]);
  });

  it('gives a Participant only what writes values, and a Viewer only what reads (surface.md "Menu bar")', () => {
    const byLevel = (level: OfficeItem['level']) =>
      catalogueItems(menus)
        .filter(({ item }) => item.level === level && item.status === 'built')
        .map(({ item }) => item.id);
    expect(byLevel('participate')).toEqual([
      'undo',
      'redo',
      'cut',
      'paste',
      'paste-values-only',
      'delete-values',
    ]);
    expect(byLevel('view')).toEqual([
      'open',
      ...DOWNLOAD_ITEMS.map((i) => i.id),
      ...SHEET_DOWNLOAD_ITEMS.map((i) => i.id),
      'copy',
      'show-formulas',
      ...ZOOM_ITEMS.map((i) => i.id),
      'search-the-menus',
      'keyboard-shortcuts',
    ]);
  });

  // keyboard-shortcuts.md: each item Google gives keys to names its row; a built item's row runs or is heard.
  it('names the shortcut rows of the items Google gives keys to', () => {
    const shortcutOf = new Map(catalogueItems(menus).map(({ item }) => [item.id, item.shortcut]));
    expect(shortcutOf.get('undo')).toBe('undo');
    expect(shortcutOf.get('copy')).toBe('copy');
    expect(shortcutOf.get('bold')).toBe('bold');
    expect(shortcutOf.get('align-centre')).toBe('center-align');
    expect(shortcutOf.get('number-time')).toBe('format-as-time');
    expect(shortcutOf.get('keyboard-shortcuts')).toBe('show-common-keyboard-shortcuts');
    const statusOf = new Map(SPREADSHEET_SHORTCUTS.map((r) => [r.id, r.status]));
    const builtOnSpecified = catalogueItems(menus).filter(
      ({ item }) =>
        item.status === 'built' && item.shortcut && statusOf.get(item.shortcut) === 'specified',
    );
    expect(builtOnSpecified).toEqual([]);
  });

  it('leaves the shell’s own items to the shell', () => {
    const ids = catalogueItems(menus).map(({ item }) => item.id);
    expect(SHELL_BOUND_ITEMS.filter((id) => ids.includes(id))).toEqual([
      'open',
      'rename',
      'share-with-others',
      'search-the-menus',
      'keyboard-shortcuts',
    ]);
  });
});

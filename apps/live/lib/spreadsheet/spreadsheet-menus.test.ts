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
  const menus = spreadsheetMenus('ods', 'en-GB');

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
      catalogueItems(spreadsheetMenus(format, 'en-GB')).find(
        ({ item }) => item.id === CONVERT_ITEM_ID,
      )!.item;
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
      'expand-all-row-groups',
      'collapse-all-row-groups',
      'expand-all-column-groups',
      'collapse-all-column-groups',
      ...ZOOM_ITEMS.map((i) => i.id),
      'full-screen',
      // Data › Named Ranges: read by everyone (data-tools.md "Named ranges and named functions").
      'named-ranges',
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

// formatting.md "Number formats" (D190): each Number item shows its example in the workbook's locale.
describe('the Number menu’s examples', () => {
  const notes = (locale: string) =>
    Object.fromEntries(
      catalogueItems(spreadsheetMenus('ods', locale))
        .filter(({ item }) => item.id.startsWith('number-'))
        .map(({ item }) => [item.id, item.note]),
    );

  it('draws each example as the grid would, none for Automatic and Plain Text', () => {
    expect(notes('en-GB')).toEqual({
      'number-automatic': undefined,
      'number-plain-text': undefined,
      'number-number': '1,000.12',
      'number-percent': '10.12%',
      'number-scientific': '1.00E+03',
      'number-accounting': '£ (1,000.12)',
      'number-financial': '(1,000.12)',
      'number-currency': '£1,000.12',
      'number-currency-rounded': '£1,000',
      'number-date': '26/09/2008',
      'number-time': '15:59:00',
      'number-date-time': '26/09/2008, 15:59',
      'number-duration': '24:01:00',
    });
    expect(notes('en-US')['number-date']).toBe('09/26/2008');
    expect(notes('de-DE')['number-number']).toBe('1.000,12');
  });

  it('builds Financial and Currency Rounded', () => {
    const status = (id: string) =>
      catalogueItems(spreadsheetMenus('ods', 'en-GB')).find(({ item }) => item.id === id)?.item
        .status;
    expect(status('number-financial')).toBe('built');
    expect(status('number-currency-rounded')).toBe('built');
  });
});

// formatting.md "Number formats" (D194): the recently used follow Duration, each with its example.
describe('the Number menu\u2019s recently used', () => {
  const numberEntries = (codes: readonly string[]) => {
    const format = spreadsheetMenus('ods', 'en-GB', codes).find((m) => m.id === 'format')!;
    const number = format.entries.find((e) => e.kind === 'submenu' && e.id === 'number');
    return number?.kind === 'submenu' ? number.entries : [];
  };

  it('lists each code after Duration, with its example, and nothing for none', () => {
    const entries = numberEntries(['0.0"kg"']);
    const at = entries.findIndex((e) => e.kind === 'item' && e.id === 'number-duration');
    expect(entries[at + 1]).toEqual({ kind: 'separator' });
    expect(entries[at + 2]).toMatchObject({
      id: 'number-recent-0',
      label: '0.0"kg"',
      note: '1000.1kg',
      status: 'built',
      checkable: 'radio',
    });
    expect(entries[at + 3]).toEqual({ kind: 'separator' });
    const none = numberEntries([]);
    const end = none.findIndex((e) => e.kind === 'item' && e.id === 'number-duration');
    expect(none[end + 2]).toMatchObject({ id: 'custom-currency' });
  });
});

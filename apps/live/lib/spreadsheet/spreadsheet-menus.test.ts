import { describe, expect, it } from 'vitest';
import type { OfficeItem, OfficeSubmenu } from '@/lib/office/office-catalogue';
import {
  CONVERT_ITEM_ID,
  DOWNLOAD_ITEMS,
  SHEET_DOWNLOAD_ITEMS,
  spreadsheetMenus,
} from './spreadsheet-menus';

// docs/specs/029-sheets/files-and-print.md "Download" and "Converting": File › Download in the three native formats,
// and Convert to the other standard, an Editor's.
describe('spreadsheetMenus', () => {
  const file = (format: 'ods' | 'fods' | 'xlsx') => spreadsheetMenus(format)[0]!.entries;

  it('lists Open, Download’s three formats and Convert, in that order', () => {
    const entries = file('ods');
    expect(entries.map((e) => (e.kind === 'separator' ? '-' : e.id))).toEqual([
      'open',
      'download',
      CONVERT_ITEM_ID,
    ]);
    const download = entries[1] as OfficeSubmenu;
    expect(download.entries.map((e) => (e as OfficeItem).label)).toEqual([
      'Microsoft Excel (.xlsx)',
      'OpenDocument (.ods)',
      'Flat OpenDocument (.fods)',
      'Comma-separated values (.csv, current sheet)',
      'Tab-separated values (.tsv, current sheet)',
    ]);
    expect(DOWNLOAD_ITEMS.map((i) => i.format)).toEqual(['xlsx', 'ods', 'fods']);
    expect(SHEET_DOWNLOAD_ITEMS.map((i) => i.format)).toEqual(['csv', 'tsv']);
  });

  it('names the format Convert goes to, and keeps it an Editor’s', () => {
    const convert = (format: 'ods' | 'fods' | 'xlsx') => file(format)[2] as OfficeItem;
    expect(convert('ods').label).toBe('Convert to Excel (.xlsx)');
    expect(convert('fods').label).toBe('Convert to Excel (.xlsx)');
    expect(convert('xlsx').label).toBe('Convert to OpenDocument (.ods)');
    expect(convert('xlsx').level).toBe('edit');
  });
});

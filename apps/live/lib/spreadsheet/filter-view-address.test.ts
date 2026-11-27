import { describe, expect, it } from 'vitest';
import { filterViewAddress, filterViewOfSearch } from './filter-view-address';

describe('filter view address', () => {
  it('names an open view in the query, keeping the tab', () => {
    expect(filterViewAddress('https://docs.nu/d/abc?x=1#t=tab1', 'sheet1', 'fvaa')).toBe(
      '/d/abc?x=1&fview=sheet1.fvaa#t=tab1',
    );
    expect(
      filterViewAddress('https://docs.nu/d/abc?fview=sheet1.fvaa#t=tab1', 'sheet1', null),
    ).toBe('/d/abc#t=tab1');
  });

  it('reads the view an address names, refusing other shapes', () => {
    expect(filterViewOfSearch('?fview=sheet1.fvaa')).toEqual({ sheetId: 'sheet1', viewId: 'fvaa' });
    expect(filterViewOfSearch('?fview=sheet1')).toBeNull();
    expect(filterViewOfSearch('?fview=.fvaa')).toBeNull();
    expect(filterViewOfSearch('?fview=sheet1.')).toBeNull();
    expect(filterViewOfSearch('')).toBeNull();
  });
});

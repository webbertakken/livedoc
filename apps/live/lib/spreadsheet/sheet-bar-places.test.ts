// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar": where the sheet bar's changes land.
import { describe, expect, it } from 'vitest';
import {
  duplicateName,
  landingAfter,
  openAfterDelete,
  tabsBefore,
  tabsWithInserted,
} from './sheet-bar-places';

const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const ids = (ts: readonly { id: string }[]) => ts.map((t) => t.id);

describe('tabsWithInserted', () => {
  it('puts the tab after the one named, first for none, last for one not there', () => {
    expect(ids(tabsWithInserted(tabs, { id: 'n' }, 'a'))).toEqual(['a', 'n', 'b', 'c']);
    expect(ids(tabsWithInserted(tabs, { id: 'n' }, 'c'))).toEqual(['a', 'b', 'c', 'n']);
    expect(ids(tabsWithInserted(tabs, { id: 'n' }, null))).toEqual(['n', 'a', 'b', 'c']);
    expect(ids(tabsWithInserted(tabs, { id: 'n' }, 'gone'))).toEqual(['a', 'b', 'c', 'n']);
  });

  it('never holds the tab twice', () => {
    expect(ids(tabsWithInserted(tabs, { id: 'a' }, 'c'))).toEqual(['b', 'c', 'a']);
  });
});

describe('tabsBefore and landingAfter', () => {
  it('names the tabs before, none for the first or one not there', () => {
    expect(tabsBefore(tabs, 'c')).toEqual(['a', 'b']);
    expect(tabsBefore(tabs, 'a')).toEqual([]);
    expect(tabsBefore(tabs, 'gone')).toEqual([]);
  });

  it('goes back after the nearest earlier tab still there, else first', () => {
    expect(landingAfter(tabs, ['a', 'b'])).toBe('b');
    expect(landingAfter([{ id: 'a' }, { id: 'c' }], ['a', 'b'])).toBe('a');
    expect(landingAfter([{ id: 'c' }], ['a', 'b'])).toBeNull();
    expect(landingAfter(tabs, [])).toBeNull();
  });
});

describe('openAfterDelete (D173)', () => {
  it('opens the tab after, else the one before, else none', () => {
    expect(openAfterDelete(tabs, 'b')).toBe('c');
    expect(openAfterDelete(tabs, 'c')).toBe('b');
    expect(openAfterDelete([{ id: 'a' }], 'a')).toBeNull();
    expect(openAfterDelete(tabs, 'gone')).toBeNull();
  });
});

describe('duplicateName (D171)', () => {
  it('is Copy of <name>, numbered from 2 when taken, case aside', () => {
    expect(duplicateName('Sheet1', ['Sheet1'])).toBe('Copy of Sheet1');
    expect(duplicateName('Sheet1', ['Sheet1', 'copy of sheet1'])).toBe('Copy of Sheet1 2');
  });
});

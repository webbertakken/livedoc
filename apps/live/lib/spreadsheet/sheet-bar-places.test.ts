// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar": where the sheet bar's changes land.
import { describe, expect, it } from 'vitest';
import {
  duplicateName,
  landingAfter,
  moveByAfter,
  openInstead,
  shownTabs,
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

const none = new Set<string>();

describe('shownTabs (D179)', () => {
  it('leaves the hidden tabs out, never the open one', () => {
    expect(ids(shownTabs(tabs, new Set(['a', 'b']), 'b'))).toEqual(['b', 'c']);
    expect(shownTabs(tabs, none, 'a')).toBe(tabs);
  });
});

describe('moveByAfter (D181)', () => {
  const four = [...tabs, { id: 'd' }];
  it('steps over hidden tabs to the next shown', () => {
    const hidden = new Set(['b']);
    expect(moveByAfter(four, hidden, 'a', 1)).toEqual({ after: 'c' });
    expect(moveByAfter(four, hidden, 'c', -1)).toEqual({ after: null });
    expect(moveByAfter(four, hidden, 'd', -1)).toEqual({ after: 'b' });
  });
  it('goes nowhere past either end or for a tab not there', () => {
    expect(moveByAfter(four, new Set(['d']), 'c', 1)).toBeNull();
    expect(moveByAfter(four, none, 'a', -1)).toBeNull();
    expect(moveByAfter(four, none, 'gone', 1)).toBeNull();
  });
});

describe('openInstead (D173, D179)', () => {
  it('opens the next shown tab, else the one before', () => {
    expect(openInstead(tabs, new Set(['b']), 'a')).toBe('c');
    expect(openInstead(tabs, new Set(['c']), 'b')).toBe('a');
  });

  it('opens the tab after, else the one before, else none', () => {
    expect(openInstead(tabs, none, 'b')).toBe('c');
    expect(openInstead(tabs, none, 'c')).toBe('b');
    expect(openInstead([{ id: 'a' }], none, 'a')).toBeNull();
    expect(openInstead(tabs, none, 'gone')).toBeNull();
  });
});

describe('duplicateName (D171)', () => {
  it('is Copy of <name>, numbered from 2 when taken, case aside', () => {
    expect(duplicateName('Sheet1', ['Sheet1'])).toBe('Copy of Sheet1');
    expect(duplicateName('Sheet1', ['Sheet1', 'copy of sheet1'])).toBe('Copy of Sheet1 2');
  });
});

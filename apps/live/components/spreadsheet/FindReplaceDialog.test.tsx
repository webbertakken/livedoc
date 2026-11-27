// @vitest-environment jsdom
// docs/specs/029-sheets/data-tools.md "Find and replace": the dialog's Find, Replace and Replace All, its words, a
// Viewer's dialog, a refused pattern and Specific Range.
import { useEffect } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/telemetry';
import { makeSheet, renderSheet, type SheetHarness } from '@/components/sheets/sheet-ui-test-utils';
import { FindReplaceDialog } from './FindReplaceDialog';
import { useFindReplaceState, type FindReplaceState } from './find-replace-state';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

// The dialog's state as last rendered, for the test to open it.
const held: { state: FindReplaceState | null } = { state: null };

function Host() {
  const state = useFindReplaceState(['t1'], ['t1']);
  useEffect(() => {
    held.state = state;
  });
  return state.open ? <FindReplaceDialog state={state} /> : null;
}

function show(h: SheetHarness, opts: { canEdit?: boolean } = {}) {
  renderSheet(h, () => <Host />, opts);
  act(() => held.state!.openWith('apple'));
}

const field = (name: string) => screen.getByLabelText<HTMLInputElement>(name);
const btn = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
const line = () => document.querySelector('[aria-live="polite"]')!.textContent;
const tick = (name: string) => fireEvent.click(screen.getByRole('checkbox', { name }));

describe('Find and Replace', () => {
  let h: SheetHarness;
  beforeEach(async () => {
    vi.mocked(track).mockClear();
    h = await makeSheet({ cells: { A1: 'apple', B2: 'Apple pie', C3: '=1+1', A4: 'apple' } });
  });

  it('opens on the Find bar’s text with every option, Search on All Sheets', () => {
    show(h);
    expect(screen.getByRole('dialog', { name: 'Find and Replace' })).toBeTruthy();
    expect(field('Find').value).toBe('apple');
    expect(field('Replace With').value).toBe('');
    expect(field('Search').value).toBe('all');
    for (const name of [
      'Match Case',
      'Match Entire Cell Contents',
      'Search Using Regular Expressions',
      'Also Search Within Formulas',
      'Also Search Within Links',
    ])
      expect(screen.getByRole('checkbox', { name })).toBeTruthy();
    for (const name of ['Find', 'Replace', 'Replace All', 'Done']) expect(btn(name)).toBeTruthy();
  });

  it('finds the next match from the active cell and loops past the last', () => {
    show(h);
    fireEvent.click(btn('Find'));
    expect(h.ctl().selection.active).toEqual({ r: 1, c: 1 });
    fireEvent.click(btn('Find'));
    expect(h.ctl().selection.active).toEqual({ r: 3, c: 0 });
    expect(line()).toBe('');
    fireEvent.click(btn('Find'));
    expect(h.ctl().selection.active).toEqual({ r: 0, c: 0 });
    expect(line()).toBe('No more results, looping around');
    fireEvent.change(field('Find'), { target: { value: 'zebra' } });
    fireEvent.keyDown(field('Find'), { key: 'Enter' });
    expect(line()).toBe('No results for "zebra"');
  });

  it('replaces the match it is on, then goes to the next', () => {
    show(h);
    fireEvent.change(field('Replace With'), { target: { value: 'pear' } });
    // Not on a match yet: Replace finds first.
    act(() => h.select('C3'));
    fireEvent.click(btn('Replace'));
    expect(h.ctl().selection.active).toEqual({ r: 3, c: 0 });
    expect(h.cell('A4')?.input).toEqual({ s: 'apple' });
    fireEvent.click(btn('Replace'));
    expect(h.cell('A4')?.input).toEqual({ s: 'pear' });
    expect(h.ctl().selection.active).toEqual({ r: 0, c: 0 });
  });

  it('replaces every match as one change and says how many', () => {
    show(h);
    fireEvent.change(field('Replace With'), { target: { value: 'pear' } });
    fireEvent.click(btn('Replace All'));
    expect(line()).toBe('Replaced 3 instances of "apple" with "pear"');
    expect(h.cell('B2')?.input).toEqual({ s: 'pear pie' });
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Changed', 'Replace');
    fireEvent.click(btn('Replace All'));
    expect(line()).toBe('No results for "apple"');
  });

  it('keeps to the case and to whole cells when asked', () => {
    show(h);
    tick('Match Case');
    tick('Match Entire Cell Contents');
    fireEvent.change(field('Replace With'), { target: { value: 'x' } });
    fireEvent.click(btn('Replace All'));
    expect(line()).toBe('Replaced 2 instances of "apple" with "x"');
    expect(h.cell('B2')?.input).toEqual({ s: 'Apple pie' });
  });

  it('says when a regular expression cannot be read, the buttons dimmed', () => {
    show(h);
    tick('Search Using Regular Expressions');
    fireEvent.change(field('Find'), { target: { value: '(ap' } });
    expect(line()).toBe('Enter a valid regular expression');
    expect(btn('Find').disabled).toBe(true);
    expect(btn('Replace All').disabled).toBe(true);
    fireEvent.change(field('Find'), { target: { value: '^(ap)ple$' } });
    fireEvent.change(field('Replace With'), { target: { value: '$1ricot' } });
    fireEvent.click(btn('Replace All'));
    expect(h.cell('A1')?.input).toEqual({ s: 'apricot' });
  });

  it('searches a Specific Range, the selection until typed over', () => {
    show(h);
    act(() => h.select('A1:B2'));
    fireEvent.change(field('Search'), { target: { value: 'range' } });
    expect(field('Range').value).toBe("'Sheet 1'!A1:B2");
    fireEvent.change(field('Replace With'), { target: { value: 'pear' } });
    fireEvent.click(btn('Replace All'));
    expect(line()).toBe('Replaced 2 instances of "apple" with "pear"');
    expect(h.cell('A4')?.input).toEqual({ s: 'apple' });
    fireEvent.change(field('Range'), { target: { value: 'Nowhere!A1' } });
    expect(line()).toBe('Enter a range, like A1:B4 or Sheet2!A1:B4');
    expect(btn('Find').disabled).toBe(true);
  });

  it('gives a Viewer Find and Done only', () => {
    show(h, { canEdit: false });
    expect(screen.queryByLabelText('Replace With')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Replace All' })).toBeNull();
    fireEvent.click(btn('Find'));
    expect(h.ctl().selection.active).toEqual({ r: 1, c: 1 });
    fireEvent.click(btn('Done'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

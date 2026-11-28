// docs/specs/029-sheets/plan-links.md "The Spreadsheet slot": the first visible sheet of the spreadsheet, or why not.
import { describe, expect, it } from 'vitest';
import { Workbook, type Sheet } from '@livedoc/sheets';
import type { LinkedRead } from './linked-sheets';
import { firstSheetIdOf, spreadsheetSlotRead } from './spreadsheet-slot-read';

const wb = new Workbook({ sheets: [], locale: 'en-GB' });
const sheet = (id: string) => ({ id }) as unknown as Sheet;
const ready = (over: Partial<Extract<LinkedRead, { state: 'ready' }>> = {}): LinkedRead => ({
  state: 'ready',
  sheet: null,
  wb,
  locale: 'en-GB',
  version: 1,
  name: 'Budget',
  sheets: [
    { id: 's1', title: 'Costs' },
    { id: 's2', title: 'Income' },
  ],
  ...over,
});

describe('a Spreadsheet slot’s read', () => {
  it('names the first visible sheet once the sheets are read', () => {
    expect(firstSheetIdOf({ state: 'loading' })).toBe('');
    expect(firstSheetIdOf(ready())).toBe('s1');
    expect(firstSheetIdOf(ready({ sheets: [] }))).toBe('');
  });

  it('shows the first sheet with its spreadsheet’s name', () => {
    const first = ready({ sheet: sheet('s1'), version: 7, name: 'Budget 2' });
    expect(spreadsheetSlotRead(ready(), first)).toEqual({
      state: 'ready',
      name: 'Budget 2',
      sheetId: 's1',
      title: 'Costs',
      sheet: sheet('s1'),
      wb,
      version: 7,
    });
  });

  it('says why it shows nothing: loading, denied, too large, failed or no sheets', () => {
    expect(spreadsheetSlotRead({ state: 'loading' }, { state: 'loading' }).state).toBe('loading');
    expect(spreadsheetSlotRead({ state: 'denied' }, { state: 'loading' }).state).toBe('denied');
    expect(spreadsheetSlotRead({ state: 'too-large' }, { state: 'loading' }).state).toBe(
      'too-large',
    );
    expect(spreadsheetSlotRead({ state: 'failed' }, { state: 'loading' }).state).toBe('failed');
    expect(spreadsheetSlotRead(ready(), { state: 'loading' }).state).toBe('loading');
    expect(spreadsheetSlotRead(ready(), { state: 'failed' }).state).toBe('failed');
    expect(spreadsheetSlotRead(ready({ sheets: [] }), { state: 'loading' })).toEqual({
      state: 'empty',
      name: 'Budget',
    });
  });

  it('waits for the next sheets read when its first sheet went or moved', () => {
    expect(spreadsheetSlotRead(ready(), ready({ sheet: null })).state).toBe('loading');
    expect(spreadsheetSlotRead(ready(), ready({ sheet: sheet('s2') })).state).toBe('loading');
  });
});

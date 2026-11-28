// docs/specs/029-sheets/review.md "Notes": change_sheet's note op sets a range's notes (null removes them); read_sheet
// gives each cell's note, a cell holding only a note too.
import { describe, expect, it } from 'vitest';
import { SHEET_NOTE_MAX, sheetFromJson, WorkbookRecord } from '@livedoc/sheets';
import { DOC_A, fakeApi, library } from '../testing/fake-api';
import { sheetJson, sheetServer } from '../testing/sheets';
import { changeSheet } from './change-sheet';
import { readSheet } from './read-sheet';

const WORKBOOK = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

function book() {
  const server = sheetServer(
    DOC_A,
    [sheetJson({ id: 'sheet_models', tabId: 'tab-models', title: 'Models' }, [['Total', 'Mail']])],
    { workbook: WORKBOOK },
  );
  const api = fakeApi(Object.assign(server.routes, library));
  return { api, server };
}

const change = (api: ReturnType<typeof book>['api'], changes: unknown[]) =>
  changeSheet(api, DOC_A, { sheet: 'Models', changes: changes as never }, 'mcp');

describe('change_sheet note', () => {
  it('puts a note on each cell of a range, read back beside the values, a note alone too', async () => {
    const { api, server } = book();
    const out = await change(api, [
      { op: 'note', range: 'A1:B1', note: 'Check these' },
      { op: 'note', range: 'C3', note: 'Two\r\nlines' },
    ]);
    expect(out.refusal).toBeUndefined();
    expect(out.applied).toEqual(['noted A1:B1', 'noted C3']);
    const { rows, cols } = server.sheets[0]!.layout;
    const sheet = sheetFromJson({ ...server.sheets[0]!, rev: 0 });
    expect(sheet.cells.get(`${rows[0]}:${cols[0]}`)).toEqual({
      input: { s: 'Total' },
      note: 'Check these',
    });
    const read = await readSheet(api, DOC_A, { sheet: 'Models' });
    expect(read.ok && read.cells.map((c) => [c.at, c.value, c.note])).toEqual([
      ['A1', 'Total', 'Check these'],
      ['B1', 'Mail', 'Check these'],
      ['C3', null, 'Two\nlines'],
    ]);
  });

  it('takes notes off with null, values staying', async () => {
    const { api, server } = book();
    await change(api, [{ op: 'note', range: 'A1:C3', note: 'x' }]);
    const out = await change(api, [{ op: 'note', range: 'A1:C3', note: null }]);
    expect(out.applied).toEqual(['took the notes off A1:C3']);
    const sheet = sheetFromJson({ ...server.sheets[0]!, rev: 0 });
    expect([...sheet.cells.values()].some((c) => c.note !== undefined)).toBe(false);
    expect(sheet.cells.size).toBe(2);
  });

  it('refuses a note too long, an empty one, a bad range, and one past the sheet’s cells', async () => {
    const { api } = book();
    const long = await change(api, [
      { op: 'note', range: 'A1', note: 'x'.repeat(SHEET_NOTE_MAX + 1) },
    ]);
    expect(long.refusal).toMatchObject({ code: 'note_too_long' });
    expect(long.refusal?.message).toContain('50,000');
    const empty = await change(api, [{ op: 'note', range: 'A1', note: '' }]);
    expect(empty.refusal).toMatchObject({ code: 'note_invalid' });
    const bad = await change(api, [{ op: 'note', range: 'nope', note: 'x' }]);
    expect(bad.refusal).toMatchObject({ code: 'range_invalid' });
    const past = await change(api, [{ op: 'note', range: 'ZZ9999', note: 'x' }]);
    expect(past.refusal).toMatchObject({ code: 'range_invalid' });
  });
});

// docs/specs/029-sheets/review.md "Agents": read_sheet gives each anchored cell its open comment threads, a cell holding
// only a thread too; a Plan Sheet reads none.
import { describe, expect, it } from 'vitest';
import { WorkbookRecord } from '@livedoc/sheets';
import { DOC_A, fakeApi, library } from '../testing/fake-api';
import { sheetJson, sheetServer } from '../testing/sheets';
import { readSheet } from './read-sheet';

function book(workbook: boolean) {
  const server = sheetServer(
    DOC_A,
    [
      sheetJson({ id: 'sheet_models', tabId: 'tab-models', title: 'Models' }, [
        ['Total', 'Mail'],
        ['', ''],
      ]),
    ],
    workbook ? { workbook: WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' }) } : {},
  );
  const { rows, cols } = server.sheets[0]!.layout;
  const thread = (
    id: string,
    r: number,
    c: number,
    resolved = false,
    sheetId = 'sheet_models',
  ) => ({
    id,
    sheetId,
    anchor: { r1: rows[r]!, c1: cols[c]!, r2: rows[r]!, c2: cols[c]! },
    resolved,
    comments: [],
    v: 1,
  });
  const api = fakeApi(
    Object.assign(server.routes, library, {
      [`/documents/${DOC_A}/sheet-threads`]: {
        threads: [
          thread('a', 0, 0),
          thread('b', 0, 0),
          thread('c', 1, 1),
          thread('d', 0, 1, true),
          thread('e', 0, 1, false, 'other'),
        ],
      },
    }),
  );
  return api;
}

describe('read_sheet comments', () => {
  it('counts each anchored cell’s open threads, a cell holding only a thread too', async () => {
    const read = await readSheet(book(true), DOC_A, { sheet: 'Models', range: 'A1:B2' });
    expect(read.ok && read.cells.map((c) => [c.at, c.value, c.comments])).toEqual([
      ['A1', 'Total', 2],
      ['B1', 'Mail', undefined],
      ['B2', null, 1],
    ]);
  });

  it('reads no threads of a Plan Sheet', async () => {
    const api = book(false);
    const read = await readSheet(api, DOC_A, { sheet: 'Models', range: 'A1:B2' });
    expect(read.ok && read.cells.some((c) => c.comments !== undefined)).toBe(false);
    expect(api.calls.some((c) => c.includes('sheet-threads'))).toBe(false);
  });
});

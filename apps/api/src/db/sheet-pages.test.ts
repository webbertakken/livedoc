import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentEnv } from '../types';
import { ROW_PAGE_READS, readRowPage } from './sheet-pages';
import * as sheets from './sheets';
import type { SheetHead } from './sheets';

// docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Loading by viewport: a page is the sheet at its rev, read
// again when a write lands between the head's read and the cells'.

const head = (rev: number): SheetHead =>
  ({
    id: 'sheetA00',
    tabId: 't1',
    title: 'A',
    layout: { rows: ['r1', 'r2', 'r3'], cols: ['c1'] },
    rev,
    cellCount: 0,
    cellBytes: 0,
  }) as unknown as SheetHead;

// A room whose batches answer each rev in turn, and no cells.
function roomAnswering(revs: (number | undefined)[]) {
  const bound: unknown[][] = [];
  const statement = { bind: (...args: unknown[]) => (bound.push(args), statement) };
  const batch = vi.fn(async () => {
    const rev = revs.shift();
    return [{ results: rev === undefined ? [] : [{ rev }] }, { results: [] }];
  });
  const env = { DOCUMENT_DB: { prepare: () => statement, batch } } as unknown as DocumentEnv;
  return { env, batch, bound };
}

afterEach(() => vi.restoreAllMocks());

describe('readRowPage', () => {
  it("reads the asked rows' ids, clamped to the sheet", async () => {
    const { env, bound } = roomAnswering([4]);
    const page = await readRowPage(env, 'd1', 'sheetA00', { from: 1, to: 9 }, head(4));
    expect(page).toMatchObject({ span: { from: 1, to: 3 }, cells: [] });
    expect(bound[1]).toEqual(['d1', 'sheetA00', '["r2","r3"]']);
  });

  it('reads again when a write landed between the reads', async () => {
    const { env, batch } = roomAnswering([5, 5]);
    vi.spyOn(sheets, 'readSheetHead').mockResolvedValue(head(5));
    const page = await readRowPage(env, 'd1', 'sheetA00', { from: 0, to: 2 }, head(4));
    expect(page).toMatchObject({ head: { rev: 5 } });
    expect(batch).toHaveBeenCalledTimes(2);
  });

  it('gives up as busy when writes keep landing', async () => {
    const { env, batch } = roomAnswering([5, 6, 7]);
    let rev = 4;
    vi.spyOn(sheets, 'readSheetHead').mockImplementation(async () => head(rev++));
    expect(await readRowPage(env, 'd1', 'sheetA00', { from: 0, to: 2 })).toBe('busy');
    expect(batch).toHaveBeenCalledTimes(ROW_PAGE_READS);
  });

  it('finds no sheet that is gone, before or between the reads', async () => {
    vi.spyOn(sheets, 'readSheetHead').mockResolvedValue(null);
    expect(await readRowPage(roomAnswering([]).env, 'd1', 'sheetA00', { from: 0, to: 2 })).toBe(
      null,
    );
    const { env } = roomAnswering([undefined]);
    expect(await readRowPage(env, 'd1', 'sheetA00', { from: 0, to: 2 }, head(1))).toBe(null);
  });
});

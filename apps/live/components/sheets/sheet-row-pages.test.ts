// docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Loading by viewport: the edges of paging a sheet in, past
// what the store's own tests reach (sheet-store-viewport.test.ts).
import { describe, expect, it, vi } from 'vitest';
import type { SheetCellsResponse } from '@livedoc/api-schema';
import { emptyLayout, sheetFromJson, type RowSpan, type Sheet } from '@livedoc/sheets';
import { RowPages, type RowPagesHost } from './sheet-row-pages';

let seq = 9;
const rand = () => ((seq = (seq * 16807) % 2147483647) - 1) / 2147483646;
const by = { id: 'me', name: 'Me', color: '#000000' };

function sheetOf(rows: number): Sheet {
  return sheetFromJson({
    id: 'sheetA00',
    tabId: 't1',
    title: 'A',
    layout: emptyLayout(rand, rows, 1),
    cells: [],
    rev: 1,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: by,
  });
}

function host(sheet: Sheet | undefined, extra: Partial<RowPagesHost> = {}): RowPagesHost {
  return {
    fetchCells: vi.fn(async (_id: string, rows: RowSpan) => ({
      rev: 1,
      from: rows.from,
      to: rows.to,
      cells: [],
    })),
    confirmed: () => sheet,
    view: () => sheet,
    land: vi.fn(),
    refetch: vi.fn(async () => {}),
    wait: async () => {},
    retryMs: 0,
    ...extra,
  };
}

describe('RowPages', () => {
  it('holds nothing for a sheet that arrived whole', () => {
    const sheet = sheetOf(3);
    const pages = new RowPages(host(sheet));
    pages.arrived('sheetA00', sheet.layout.rows, 3);
    expect(pages.isPartial('sheetA00')).toBe(false);
    expect(pages.holds('sheetA00', { kind: 'layout', changes: [] })).toBe(false);
  });

  it('stops paging a sheet gone from the store', async () => {
    const sheet = sheetOf(3);
    const h = host(undefined);
    const pages = new RowPages(h);
    pages.arrived('sheetA00', sheet.layout.rows, 1);
    await pages.run(['sheetA00']);
    expect(pages.isPartial('sheetA00')).toBe(false);
    expect(h.fetchCells).not.toHaveBeenCalled();
  });

  it('forgets a sheet the store dropped', () => {
    const sheet = sheetOf(3);
    const pages = new RowPages(host(sheet));
    pages.arrived('sheetA00', sheet.layout.rows, 1);
    pages.forget('sheetA00');
    expect(pages.isPartial('sheetA00')).toBe(false);
  });

  it('stays partial when the whole sheet cannot be fetched either', async () => {
    const sheet = sheetOf(3);
    const h = host(sheet, { fetchCells: vi.fn(async () => Promise.reject(new Error('down'))) });
    const pages = new RowPages(h);
    pages.arrived('sheetA00', sheet.layout.rows, 1);
    await pages.run(['sheetA00']);
    expect(h.refetch).toHaveBeenCalledOnce();
    expect(pages.isPartial('sheetA00')).toBe(true);
  });

  it('lets a cell write through when the sheet is not in view', () => {
    const sheet = sheetOf(3);
    const pages = new RowPages(host(sheet, { view: () => undefined }));
    pages.arrived('sheetA00', sheet.layout.rows, 1);
    const r = sheet.layout.rows[2]!;
    expect(pages.holds('sheetA00', { kind: 'cells', cells: [{ r, c: 'x', i: { n: 1 } }] })).toBe(
      false,
    );
  });

  it('holds every cell write when its first row not loaded has gone from the view', () => {
    const sheet = sheetOf(3);
    const moved = { ...sheet, layout: { ...sheet.layout, rows: sheet.layout.rows.slice(0, 1) } };
    const pages = new RowPages(host(sheet, { view: () => moved }));
    pages.arrived('sheetA00', sheet.layout.rows, 1);
    const r = sheet.layout.rows[0]!;
    expect(pages.holds('sheetA00', { kind: 'cells', cells: [{ r, c: 'x', i: { n: 1 } }] })).toBe(
      true,
    );
  });

  it('lets an earlier run go when a later one starts', async () => {
    const sheet = sheetOf(10_000);
    let release: () => void = () => {};
    const h = host(sheet, {
      fetchCells: vi.fn(
        (_id: string, rows: RowSpan) =>
          new Promise<SheetCellsResponse>((resolve) => {
            release = () => resolve({ rev: 1, from: rows.from, to: rows.to, cells: [] });
          }),
      ),
    });
    const pages = new RowPages(h);
    pages.arrived('sheetA00', sheet.layout.rows, 1);
    const first = pages.run(['sheetA00', 'sheetB00']);
    await Promise.resolve();
    void pages.run([]);
    release();
    await first;
    expect(h.land).not.toHaveBeenCalled();
  });
});

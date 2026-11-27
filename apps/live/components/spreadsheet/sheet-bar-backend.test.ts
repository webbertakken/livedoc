// docs/specs/029-sheets/sheet-store.md "Changing the workbook", "Offline documents": the sheet bar's changes land
// through the workbook routes on LiveDoc, and in the editor's tabs and sheet store in This Browser.
import { describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import { emptyLayout, sheetFromJson, type SheetJson } from '@livedoc/sheets';
import {
  apiAddWorkbookSheet,
  apiDeleteWorkbookSheet,
  apiMoveWorkbookSheet,
} from '@/lib/api/workbook-sheets';
import type { CreateOpts } from '@/components/sheets/sheet-store-client';
import { cloudSheetBar, offlineSheetBar } from './sheet-bar-backend';

vi.mock('@/lib/api/workbook-sheets', () => ({
  apiMoveWorkbookSheet: vi.fn(async () => {}),
  apiAddWorkbookSheet: vi.fn(async () => ({})),
  apiDeleteWorkbookSheet: vi.fn(async () => {}),
}));

const scope = { documentId: 'd1', ownerId: 'o', shareCode: null };
const entry = { tabId: 't2', sheetId: 'sheetTwo1', name: 'Sheet2', after: 't1' };

describe('cloudSheetBar', () => {
  it('adds through the workbook route, first when it follows no tab', async () => {
    const settle = vi.fn(async () => {});
    const bar = cloudSheetBar(scope, settle);
    await bar.put(entry);
    expect(apiAddWorkbookSheet).toHaveBeenLastCalledWith(scope, {
      tabId: 't2',
      sheetId: 'sheetTwo1',
      after: 't1',
      name: 'Sheet2',
    });
    expect(settle).not.toHaveBeenCalled();
    // A copy waits for this page's writes to land first.
    await bar.put({ ...entry, after: null, copyOf: 'sheetOne1' });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiAddWorkbookSheet).mock.lastCall![1]).toMatchObject({
      after: '',
      copyOf: 'sheetOne1',
    });
  });

  it('puts a kept sheet back under its own name, and deletes by the sheet', async () => {
    const bar = cloudSheetBar(scope, async () => {});
    await bar.put({ ...entry, restore: true });
    expect(vi.mocked(apiAddWorkbookSheet).mock.lastCall![1]).not.toHaveProperty('name');
    await bar.take(entry);
    expect(apiDeleteWorkbookSheet).toHaveBeenCalledWith(scope, 'sheetTwo1');
    await bar.move({ ...entry, after: null });
    expect(apiMoveWorkbookSheet).toHaveBeenCalledWith(scope, 'sheetTwo1', '');
    await bar.move(entry);
    expect(apiMoveWorkbookSheet).toHaveBeenLastCalledWith(scope, 'sheetTwo1', 't1');
  });
});

const source: SheetJson = {
  id: 'sheetOne1',
  tabId: 't1',
  title: 'Sheet1',
  layout: emptyLayout(Math.random, 2, 2),
  cells: [],
  rev: 4,
  createdAt: 1,
  updatedAt: 1,
  updatedBy: { id: 'o', name: 'O', color: '#000000' },
};

function offline(answer: 'made' | 'refused' = 'made') {
  let tabs: Tab[] = [{ id: 't1', name: 'Sheet1', kind: 'sheet', elements: [] }];
  const land = (opts: CreateOpts) =>
    answer === 'made' ? opts.onCreated?.() : opts.onRefused?.('sheets_full');
  const store = {
    create: vi.fn((_c: unknown, _seed: SheetJson | undefined, opts: CreateOpts = {}) => land(opts)),
    release: vi.fn(),
    restoreReleased: vi.fn((_id: string, opts: CreateOpts = {}) => {
      land(opts);
      return true;
    }),
    sheet: vi.fn((id: string) => (id === source.id ? sheetFromJson(source) : undefined)),
    layoutsOn: vi.fn((_tabId: string) => [source.layout]),
  };
  const bar = offlineSheetBar(store, (map) => (tabs = map(tabs)));
  return { bar, store, names: () => tabs.map((t) => t.name) };
}

describe('offlineSheetBar', () => {
  it('puts the tab in and makes its sheet, as a spreadsheet’s new sheet', async () => {
    const o = offline();
    await o.bar.put(entry);
    expect(o.names()).toEqual(['Sheet1', 'Sheet2']);
    const [create, seed] = o.store.create.mock.calls[0]!;
    expect(create).toMatchObject({ id: 'sheetTwo1', tabId: 't2', title: 'Sheet2' });
    expect((create as { layout: { colWidth: number } }).layout.colWidth).toBe(100);
    expect(seed).toBeUndefined();
  });

  it('copies a sheet it holds, seeded with its layout and cells', async () => {
    const o = offline();
    await o.bar.put({ ...entry, copyOf: 'sheetOne1' });
    const [create, seed] = o.store.create.mock.calls[0]!;
    expect(create).toEqual({ id: 'sheetTwo1', tabId: 't2', title: 'Sheet2', copyOf: 'sheetOne1' });
    expect(seed).toMatchObject({ id: 'sheetTwo1', tabId: 't2', title: 'Sheet2', rev: 0 });
    expect(seed!.layout.rows).toEqual(source.layout.rows);
  });

  // The workbook's names stay with the original (sheet.md D298).
  it('seeds a copy without the named ranges, which are the workbook’s', async () => {
    const o = offline();
    const r = source.layout.rows[0]!;
    const c = source.layout.cols[0]!;
    o.store.sheet.mockReturnValue(
      sheetFromJson({
        ...source,
        layout: { ...source.layout, names: [{ name: 'Rate', r1: r, c1: c, r2: r, c2: c }] },
      }),
    );
    await o.bar.put({ ...entry, copyOf: 'sheetOne1' });
    expect(o.store.create.mock.calls[0]![1]!.layout.names).toBeUndefined();
  });

  // data-tools.md "Tables" "Copies" (D451): a copy's tables take the next free names in the workbook.
  it("renames a copy's tables free of the workbook's", async () => {
    const o = offline();
    const [r1, r2] = source.layout.rows;
    const [c1, c2] = source.layout.cols;
    const held = {
      ...source,
      layout: {
        ...source.layout,
        tables: [{ id: 'tbl001', name: 'Sales', r1: r1!, c1: c1!, r2: r2!, c2: c2! }],
      },
    };
    o.store.sheet.mockReturnValue(sheetFromJson(held));
    o.store.layoutsOn.mockReturnValue([held.layout]);
    await o.bar.put({ ...entry, copyOf: 'sheetOne1' });
    expect(o.store.layoutsOn).toHaveBeenCalledWith('t1');
    expect(o.store.create.mock.calls[0]![1]!.layout.tables).toEqual([
      { ...held.layout.tables[0], name: 'Sales_2' },
    ]);
  });

  it('refuses a copy of a sheet it does not hold, taking the tab back out', async () => {
    const o = offline();
    await expect(o.bar.put({ ...entry, copyOf: 'sheetGone1' })).rejects.toMatchObject({
      code: 'sheet_not_found',
    });
    expect(o.names()).toEqual(['Sheet1']);
  });

  it('takes the tab back out when the store refuses the sheet', async () => {
    const o = offline('refused');
    await expect(o.bar.put(entry)).rejects.toMatchObject({ code: 'sheets_full' });
    expect(o.names()).toEqual(['Sheet1']);
  });

  it('takes a sheet out with its tab, kept, and puts it back', async () => {
    const o = offline();
    await o.bar.put(entry);
    await o.bar.take(entry);
    expect(o.names()).toEqual(['Sheet1']);
    expect(o.store.release).toHaveBeenCalledWith(['sheetTwo1']);
    await o.bar.put({ ...entry, after: null, restore: true });
    expect(o.names()).toEqual(['Sheet2', 'Sheet1']);
    expect(o.store.restoreReleased.mock.calls[0]![0]).toBe('sheetTwo1');
  });

  it('moves a tab among the tabs, and passes over one not there', async () => {
    const o = offline();
    await o.bar.put(entry);
    await o.bar.move({ ...entry, after: null });
    expect(o.names()).toEqual(['Sheet2', 'Sheet1']);
    await o.bar.move({ ...entry, tabId: 'gone' });
    expect(o.names()).toEqual(['Sheet2', 'Sheet1']);
  });

  it('refuses to put back a sheet no longer kept', async () => {
    const o = offline();
    o.store.restoreReleased.mockReturnValueOnce(false);
    await expect(o.bar.put({ ...entry, restore: true })).rejects.toMatchObject({
      code: 'sheet_not_found',
    });
    expect(o.names()).toEqual(['Sheet1']);
  });

  it('says a refusal without a code as an invalid write', async () => {
    const o = offline();
    o.store.create.mockImplementationOnce((_c, _s, opts: CreateOpts = {}) =>
      opts.onRefused?.(null),
    );
    await expect(o.bar.put(entry)).rejects.toMatchObject({ code: 'write_invalid' });
  });
});

// docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Loading by viewport: a spreadsheet opens on its open tab's
// first rows, every sheet's layout beside them, and the rest of each sheet loads behind in pages, the open sheet first.
// Writes reaching rows not loaded yet wait, with a toast.
import { describe, expect, it, vi } from 'vitest';
import type { SheetCellsResponse, SheetsRoomOp, WorkbookSheetDto } from '@livedoc/api-schema';
import {
  SHEET_PAGE_ROWS,
  WORKBOOK_FIRST_ROWS,
  applySheetWrite,
  emptyLayout,
  sheetFromJson,
  sheetToJson,
  type RowSpan,
  type Sheet,
  type SheetJson,
  type SheetWrite,
} from '@livedoc/sheets';
import { ApiError } from '@/lib/api/core';
import { SheetStore } from './sheet-store-client';
import { SHEET_PAGE_RETRIES } from './sheet-row-pages';

const by = { id: 'me', name: 'Me', color: '#000000' };
let seq = 5;
const rand = () => ((seq = (seq * 16807) % 2147483647) - 1) / 2147483646;
const ROWS = SHEET_PAGE_ROWS + 800;

// A spreadsheet of two sheets on the server: "Data", tall, its first column numbered by row, and "Sum", on the first
// tab, adding up Data's first column.
function spreadsheet() {
  const tall = emptyLayout(rand, ROWS, 2);
  const small = emptyLayout(rand, 4, 2);
  const data: SheetJson = {
    id: 'sheetData',
    tabId: 'tabData',
    title: 'Data',
    layout: tall,
    cells: tall.rows.map((r) => ({ r, c: tall.cols[0]!, i: { n: 1 } })),
    rev: 1,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: by,
  };
  const sum: SheetJson = {
    id: 'sheetSumm',
    tabId: 'tabSum',
    title: 'Sum',
    layout: small,
    cells: [
      {
        r: small.rows[0]!,
        c: small.cols[0]!,
        i: {
          f: {
            t: 'SUM(@0)',
            r: [
              {
                s: 'sheetData',
                r1: tall.rows[0],
                c1: tall.cols[0],
                r2: tall.rows[ROWS - 1],
                c2: tall.cols[0],
              },
            ],
          },
        },
      },
    ],
    rev: 1,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: by,
  };
  const sheets = new Map<string, Sheet>([
    ['sheetSumm', sheetFromJson(sum)],
    ['sheetData', sheetFromJson(data)],
  ]);
  const order = ['tabSum', 'tabData'];
  // Asks for pages, answered when the test says (or at once).
  const asked: { sheetId: string; rows: RowSpan; answer: () => void; fail: () => void }[] = [];
  let hold = false;

  const page = (sheetId: string, rows: RowSpan): SheetCellsResponse => {
    const sheet = sheets.get(sheetId)!;
    const to = Math.min(rows.to, sheet.layout.rows.length);
    const ids = new Set(sheet.layout.rows.slice(rows.from, to));
    return {
      rev: sheet.rev,
      from: rows.from,
      to,
      cells: sheetToJson(sheet).cells.filter((c) => ids.has(c.r)),
    };
  };

  const api = {
    fetchSheets: vi.fn(async (_s: unknown, which: { ids?: readonly string[] }) =>
      (which.ids ?? []).map((id) => sheetToJson(sheets.get(id)!)),
    ),
    fetchWorkbook: vi.fn(
      async (_s: unknown, open: { tabId: string }): Promise<WorkbookSheetDto[]> => {
        const inOrder = [...sheets.values()].sort(
          (a, b) => order.indexOf(a.tabId) - order.indexOf(b.tabId),
        );
        const opened = inOrder.find((s) => s.tabId === open.tabId) ?? inOrder[0]!;
        return inOrder.map((s) => {
          const json = sheetToJson(s);
          const rowsLoaded =
            s === opened
              ? Math.min(WORKBOOK_FIRST_ROWS, s.layout.rows.length)
              : json.cells.length
                ? 0
                : s.layout.rows.length;
          const ids = new Set(s.layout.rows.slice(0, rowsLoaded));
          return {
            ...json,
            cells: json.cells.filter((c) => ids.has(c.r)),
            cellCount: json.cells.length,
            rowsLoaded,
          };
        });
      },
    ),
    fetchSheetCells: vi.fn(
      (_s: unknown, sheetId: string, rows: RowSpan) =>
        new Promise<SheetCellsResponse>((resolve, reject) => {
          const entry = {
            sheetId,
            rows,
            answer: () => resolve(page(sheetId, rows)),
            fail: () => reject(new ApiError('sheet cells', 503, null)),
          };
          if (hold) asked.push(entry);
          else entry.answer();
        }),
    ),
    createSheet: vi.fn(),
    deleteSheet: vi.fn(async () => {}),
    writeSheet: vi.fn(async (_s: unknown, id: string, req: { write: SheetWrite }) => {
      const r = applySheetWrite(sheets.get(id)!, req.write, { now: 1, by });
      sheets.set(id, r.sheet);
      return { applied: r.applied, rev: r.sheet.rev, cells: [] };
    }),
  };

  // Someone else's write, stored; its room op.
  const external = (id: string, write: SheetWrite): SheetsRoomOp => {
    const r = applySheetWrite(sheets.get(id)!, write, { now: 1, by });
    sheets.set(id, r.sheet);
    return {
      kind: 'sheets',
      sheetId: id,
      tabId: r.sheet.tabId,
      rev: r.sheet.rev,
      applied: r.applied,
      at: 1,
      by,
    };
  };

  return { api, sheets, tall, small, asked, external, hold: (on: boolean) => (hold = on) };
}

function open(srv: ReturnType<typeof spreadsheet>) {
  const toast = vi.fn<(m: string) => void>();
  const store = new SheetStore({
    scope: { documentId: 'book', ownerId: 'o', shareCode: null, tabId: null },
    oneWorkbook: true,
    self: () => by,
    locale: 'en-GB',
    pushUndo: vi.fn(),
    toast,
    api: srv.api as never,
    wait: async () => {},
  });
  return { store, toast };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("a spreadsheet's store loading by viewport", () => {
  it('opens on the open sheet’s first rows, then pages in the rest, the open sheet first', async () => {
    const srv = spreadsheet();
    srv.hold(true);
    const { store } = open(srv);
    await store.loadTab('tabData');
    expect(srv.api.fetchWorkbook).toHaveBeenCalledWith(expect.anything(), { tabId: 'tabData' });
    expect(store.status('tabSum')).toBe('ready');
    expect(store.sheet('sheetData')!.cells.size).toBe(WORKBOOK_FIRST_ROWS);
    // Sum held no cell in its first rows: not opened, so paged in after Data.
    expect(store.loading('sheetData')).toBe(true);
    expect(store.loading('sheetSumm')).toBe(true);
    // Sum's own formula is not loaded yet.
    expect(store.workbook('tabSum').value('sheetSumm', 0, 0)).toBeNull();

    await settle();
    expect(srv.asked.map((a) => [a.sheetId, a.rows])).toEqual([
      ['sheetData', { from: WORKBOOK_FIRST_ROWS, to: WORKBOOK_FIRST_ROWS + SHEET_PAGE_ROWS }],
    ]);
    srv.asked.shift()!.answer();
    await settle();
    expect(srv.asked[0]!.rows).toEqual({ from: WORKBOOK_FIRST_ROWS + SHEET_PAGE_ROWS, to: ROWS });
    srv.asked.shift()!.answer();
    await settle();
    expect(store.loading('sheetData')).toBe(false);
    expect(store.sheet('sheetData')!.cells.size).toBe(ROWS);
    expect(srv.asked[0]!).toMatchObject({ sheetId: 'sheetSumm', rows: { from: 0, to: 4 } });
    srv.asked.shift()!.answer();
    await settle();
    expect(store.loading('sheetSumm')).toBe(false);
    // The engine read every page as it landed.
    expect(store.workbook('tabSum').value('sheetSumm', 0, 0)).toBe(ROWS);
  });

  it('asks a page again when it answers at another rev, then takes the sheet whole', async () => {
    const srv = spreadsheet();
    srv.hold(true);
    const { store } = open(srv);
    await store.loadTab('tabData');
    await settle();
    // A write lands before the page is read: the page is at a rev the store has not reached.
    srv.external('sheetData', {
      kind: 'cells',
      cells: [{ r: srv.tall.rows[0]!, c: srv.tall.cols[1]!, i: { n: 7 } }],
    });
    for (let i = 0; i < SHEET_PAGE_RETRIES; i++) {
      expect(srv.asked).toHaveLength(1);
      srv.asked.shift()!.answer();
      await settle();
    }
    expect(srv.api.fetchSheets).toHaveBeenCalledWith(expect.anything(), { ids: ['sheetData'] });
    expect(store.loading('sheetData')).toBe(false);
    expect(store.sheet('sheetData')!.cells.size).toBe(ROWS + 1);
  });

  it('asks a failed page again', async () => {
    const srv = spreadsheet();
    srv.hold(true);
    const { store } = open(srv);
    await store.loadTab('tabData');
    await settle();
    srv.asked.shift()!.fail();
    await settle();
    expect(srv.asked[0]!.rows.from).toBe(WORKBOOK_FIRST_ROWS);
    srv.hold(false);
    srv.asked.shift()!.answer();
    await settle();
    expect(store.loading('sheetData')).toBe(false);
  });

  it('pages on from its first row not loaded while others delete rows above it', async () => {
    const srv = spreadsheet();
    srv.hold(true);
    const { store } = open(srv);
    await store.loadTab('tabData');
    await settle();
    const op = srv.external('sheetData', {
      kind: 'layout',
      changes: [{ k: 'deleteRows', ids: srv.tall.rows.slice(1, 11) }],
    });
    store.receive(op);
    // The page asked before the delete lands at the old rev: asked again from the row's new place.
    srv.asked.shift()!.answer();
    await settle();
    expect(srv.asked[0]!.rows.from).toBe(WORKBOOK_FIRST_ROWS - 10);
    srv.hold(false);
    srv.asked.shift()!.answer();
    await settle();
    expect(store.loading('sheetData')).toBe(false);
    expect(store.sheet('sheetData')!.cells.size).toBe(ROWS - 10);
    expect(store.workbook('tabSum').value('sheetSumm', 0, 0)).toBe(ROWS - 10);
  });

  it('takes a sheet whole when its first row not loaded is deleted', async () => {
    const srv = spreadsheet();
    srv.hold(true);
    const { store } = open(srv);
    await store.loadTab('tabData');
    await settle();
    store.receive(
      srv.external('sheetData', {
        kind: 'layout',
        changes: [{ k: 'deleteRows', ids: [srv.tall.rows[WORKBOOK_FIRST_ROWS]!] }],
      }),
    );
    srv.asked.shift()!.answer();
    await settle();
    expect(srv.api.fetchSheets).toHaveBeenCalledWith(expect.anything(), { ids: ['sheetData'] });
    expect(store.loading('sheetData')).toBe(false);
  });

  it('starts over on a reload, dropping the pages of the load before', async () => {
    const srv = spreadsheet();
    srv.hold(true);
    const { store } = open(srv);
    await store.loadTab('tabData');
    await settle();
    const stale = srv.asked.shift()!;
    await store.loadTab('tabData', true);
    await settle();
    stale.answer();
    await settle();
    // Only the new load's page is asked for next.
    expect(srv.asked).toHaveLength(1);
    expect(store.sheet('sheetData')!.cells.size).toBe(WORKBOOK_FIRST_ROWS);
  });

  describe('writes while it loads', () => {
    async function partial() {
      const srv = spreadsheet();
      srv.hold(true);
      const opened = open(srv);
      await opened.store.loadTab('tabData');
      await settle();
      return { srv, ...opened };
    }

    it('writes cells in the rows loaded', async () => {
      const { srv, store, toast } = await partial();
      const res = store.write('sheetData', {
        kind: 'cells',
        cells: [{ r: srv.tall.rows[WORKBOOK_FIRST_ROWS - 1]!, c: srv.tall.cols[1]!, i: { n: 3 } }],
      });
      expect(res).toBeNull();
      expect(toast).not.toHaveBeenCalled();
    });

    it.each<[string, (srv: ReturnType<typeof spreadsheet>) => [string, SheetWrite]]>([
      [
        'cells past the rows loaded',
        (srv) => [
          'sheetData',
          {
            kind: 'cells',
            cells: [{ r: srv.tall.rows[WORKBOOK_FIRST_ROWS]!, c: srv.tall.cols[1]!, i: { n: 3 } }],
          },
        ],
      ],
      [
        'a cell on a row it does not know',
        (srv) => [
          'sheetData',
          { kind: 'cells', cells: [{ r: 'nowhere', c: srv.tall.cols[1]!, i: { n: 3 } }] },
        ],
      ],
      [
        'a layout change of a sheet still loading',
        (srv) => [
          'sheetData',
          {
            kind: 'layout',
            changes: [{ k: 'insertRows', after: srv.tall.rows[0]!, ids: ['rowNew01'] }],
          },
        ],
      ],
      [
        'a deletion anywhere while a sheet loads',
        (srv) => [
          'sheetSumm',
          { kind: 'layout', changes: [{ k: 'deleteRows', ids: [srv.small.rows[3]!] }] },
        ],
      ],
    ])('waits on %s, with a toast', async (_, make) => {
      const { srv, store, toast } = await partial();
      const [sheetId, write] = make(srv);
      expect(store.write(sheetId, write)).toBe('sheet_loading');
      expect(toast).toHaveBeenCalledWith('This sheet is still loading');
      expect(srv.api.writeSheet).not.toHaveBeenCalled();
    });

    it('renames a sheet still loading', async () => {
      const { store } = await partial();
      expect(store.write('sheetData', { kind: 'title', title: 'Raw' })).toBeNull();
    });

    it('lets every write through once the sheets are whole', async () => {
      const { srv, store } = await partial();
      srv.hold(false);
      for (const a of srv.asked.splice(0)) a.answer();
      await settle();
      expect(
        store.write('sheetData', {
          kind: 'layout',
          changes: [{ k: 'deleteRows', ids: [srv.tall.rows[ROWS - 1]!] }],
        }),
      ).toBeNull();
    });
  });
});

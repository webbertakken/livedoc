// A spreadsheet's imports in the sheet store (docs/specs/029-sheets/imports.md "Allow access", "Fetching"): what
// the engine asks is fetched and lands in the cells; #REF! until an Editor allows; asked again hourly while read; a
// Plan document fetches nothing. IMPORTRANGE (formulas.md "Other workbooks"): asked whatever the web's access, waiting
// on its source until connected, asked again then and every minute.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CellMap,
  cellKey,
  emptyLayout,
  sheetToJson,
  IMPORT_WORDS,
  RANGE_WORDS,
  type ImportAccess,
  type ImportAnswer,
  type ImportAsk,
  type SheetJson,
  type SheetWrite,
} from '@livedoc/sheets';
import { SheetStore } from './sheet-store-client';
import { inPlaceLink } from './sheet-engine-link';
import { IMPORT_REFRESH_MS, RANGE_REFRESH_MS } from './sheet-imports';

let n = 3;
const rand = () => (n = (n * 16807 + 11) % 2147483647) / 2147483647;
const by = { id: 'o', name: 'O', color: '#000000' };
const layout = emptyLayout(rand, 3, 3);
// The spreadsheet's one sheet, its A1 the formula given.
function sheetWith(formula: string): SheetJson {
  return sheetToJson({
    id: 'sheetOne',
    tabId: 'tabA',
    title: 'Sheet1',
    layout,
    cells: CellMap.from([
      [cellKey(layout.rows[0]!, layout.cols[0]!), { input: { f: { t: formula, r: [] } } }],
    ]),
    rev: 1,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: by,
  });
}
const SHEET = sheetWith('IMPORTDATA("https://a.example/x.csv")');

function make(opts: {
  oneWorkbook: boolean;
  importAccess?: ImportAccess;
  viaApi?: boolean;
  sheet?: SheetJson;
  answer?: (ask: ImportAsk) => ImportAnswer;
}) {
  const asked: ImportAsk[] = [];
  const fetchImport = vi.fn(async (_scope: unknown, ask: ImportAsk) => {
    asked.push(ask);
    return opts.answer ? opts.answer(ask) : { rows: [['a', '2']] };
  });
  const sheet = opts.sheet ?? SHEET;
  const deps = {
    scope: { documentId: 'book', ownerId: 'o', shareCode: null, tabId: null },
    oneWorkbook: opts.oneWorkbook,
    ...(opts.importAccess !== undefined ? { importAccess: opts.importAccess } : {}),
    engine: inPlaceLink,
    ...(opts.viaApi ? {} : { fetchImport }),
    self: () => by,
    locale: 'en-GB',
    pushUndo: vi.fn(),
    toast: vi.fn(),
    api: {
      fetchSheets: vi.fn(async () => [sheet]),
      fetchWorkbook: vi.fn(async () => [{ ...sheet, cellCount: 1, rowsLoaded: 3 }]),
      fetchSheetCells: vi.fn(),
      createSheet: vi.fn(),
      writeSheet: vi.fn(async (_s: unknown, _id: string, req: { write: SheetWrite }) => ({
        applied: req.write,
        rev: 2,
        cells: [],
      })),
      deleteSheet: vi.fn(),
    } as never,
  };
  const store = new SheetStore(deps);
  return { store, deps, asked, fetchImport };
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
const a1 = (store: SheetStore) => store.workbook('tabA').value('sheetOne', 0, 0);

afterEach(() => {
  vi.useRealTimers();
});

describe('a spreadsheet’s imports in the store', () => {
  it('fetch once allowed, and land in the cells', async () => {
    const { store, asked } = make({ oneWorkbook: true, importAccess: 'allowed' });
    await store.loadTab('tabA');
    store.workbook('tabA');
    await settle();
    expect(asked.map((a) => a.request)).toEqual([{ kind: 'data', url: 'https://a.example/x.csv' }]);
    expect(a1(store)).toBe('a');
    expect(store.workbook('tabA').value('sheetOne', 0, 1)).toBe(2);
    expect(store.usesImports()).toBe(true);
  });

  it('fetch through the api when nothing else is given', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ rows: [['via api']] }))),
    );
    try {
      const { store } = make({ oneWorkbook: true, importAccess: 'allowed', viaApi: true });
      await store.loadTab('tabA');
      store.workbook('tabA');
      await settle();
      await vi.waitFor(() => expect(a1(store)).toBe('via api'));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('read #REF! until an Editor allows, then fetch', async () => {
    const { store, deps, asked } = make({ oneWorkbook: true, importAccess: 'blocked' });
    await store.loadTab('tabA');
    store.workbook('tabA');
    await settle();
    expect(a1(store)).toMatchObject({ e: '#REF!' });
    expect(asked).toEqual([]);
    store.update({ ...deps, importAccess: 'allowed' });
    await settle();
    expect(asked).toHaveLength(1);
    expect(a1(store)).toBe('a');
  });

  it('wait in This Browser until the document is synced, then for Allow Access', async () => {
    const { store, deps, asked } = make({ oneWorkbook: true, importAccess: 'offline' });
    await store.loadTab('tabA');
    store.workbook('tabA');
    await settle();
    expect(a1(store)).toEqual({ e: '#REF!', why: IMPORT_WORDS.offline });
    store.update({ ...deps, importAccess: 'blocked' });
    await settle();
    expect(a1(store)).toEqual({ e: '#REF!', why: IMPORT_WORDS.blocked });
    expect(asked).toEqual([]);
    store.update({ ...deps, importAccess: 'allowed' });
    await settle();
    expect(asked).toHaveLength(1);
  });

  it('fetch at once when synced already allowed', async () => {
    const { store, deps, asked } = make({ oneWorkbook: true, importAccess: 'offline' });
    await store.loadTab('tabA');
    store.workbook('tabA');
    await settle();
    store.update({ ...deps, importAccess: 'allowed' });
    await settle();
    expect(asked).toHaveLength(1);
    expect(a1(store)).toBe('a');
  });

  it('are asked again hourly while anyone reads the store', async () => {
    const { store, asked } = make({ oneWorkbook: true, importAccess: 'allowed' });
    await store.loadTab('tabA');
    store.workbook('tabA');
    await settle();
    vi.useFakeTimers();
    const stop = store.subscribe(() => undefined);
    vi.advanceTimersByTime(IMPORT_REFRESH_MS);
    vi.useRealTimers();
    await settle();
    expect(asked).toHaveLength(2);
    stop();
  });

  it('are none in a Plan document', async () => {
    const { store, fetchImport } = make({ oneWorkbook: false });
    await store.loadTab('tabA');
    store.workbook('tabA');
    const stop = store.subscribe(() => undefined);
    await settle();
    expect(fetchImport).not.toHaveBeenCalled();
    expect(a1(store)).toMatchObject({
      e: '#N/A',
      why: 'Imports are fetched while the spreadsheet is open',
    });
    expect(store.usesImports()).toBe(true);
    stop();
  });
});

describe('IMPORTRANGE in the store', () => {
  const RANGE = sheetWith('IMPORTRANGE("src1", "A1")');
  let connected = false;
  const answer = (): ImportAnswer =>
    connected ? { values: [[42]] } : { error: '#REF!', why: RANGE_WORDS.connect, connect: true };

  it('asks whatever the web’s access, waits on its source, and reads it once connected', async () => {
    connected = false;
    const notified = vi.fn();
    const { store, deps, asked } = make({
      oneWorkbook: true,
      importAccess: 'blocked',
      sheet: RANGE,
      answer,
    });
    store.subscribe(notified);
    await store.loadTab('tabA');
    store.workbook('tabA');
    await settle();
    expect(asked.map((a) => a.request)).toEqual([{ kind: 'range', source: 'src1', range: 'A1' }]);
    expect(a1(store)).toEqual({ e: '#REF!', why: RANGE_WORDS.connect });
    expect(store.rangeSourcesWaiting()).toEqual(['src1']);
    expect(store.usesRangeImports()).toBe(true);
    expect(store.usesImports()).toBe(false);
    connected = true;
    store.update({ ...deps, rangeSources: ['src1'] });
    await settle();
    expect(asked).toHaveLength(2);
    expect(a1(store)).toBe(42);
    expect(store.rangeSourcesWaiting()).toEqual([]);
    store.update({ ...deps, rangeSources: ['src1'] });
    await settle();
    expect(asked).toHaveLength(2);
  });

  it('asks again every minute while anyone reads the store', async () => {
    connected = true;
    const { store, asked } = make({
      oneWorkbook: true,
      importAccess: 'blocked',
      sheet: RANGE,
      answer,
    });
    await store.loadTab('tabA');
    store.workbook('tabA');
    await settle();
    vi.useFakeTimers();
    const stop = store.subscribe(() => undefined);
    vi.advanceTimersByTime(RANGE_REFRESH_MS);
    vi.useRealTimers();
    await settle();
    expect(asked).toHaveLength(2);
    stop();
  });

  it('waits for Sync Document in This Browser', async () => {
    const { store, asked } = make({
      oneWorkbook: true,
      importAccess: 'offline',
      sheet: RANGE,
      answer,
    });
    await store.loadTab('tabA');
    store.workbook('tabA');
    await settle();
    expect(asked).toEqual([]);
    expect(store.usesRangeImports()).toBe(true);
  });
});

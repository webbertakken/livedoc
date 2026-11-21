// IMPORTRANGE through the api (docs/specs/029-sheets/formulas.md "Other workbooks"): connecting a source by an Editor
// who may open it, for good and live; the source's values for each reader with their own access; Google's words for a
// source not connected, not readable, not there, not a spreadsheet or not holding the range; a source's own
// IMPORTRANGEs read in turn, a loop refused; and the bounds, the rate and a room that cannot be reached.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbookSettingsResponse } from '@livedoc/api-schema';
import {
  emptyLayout,
  importParams,
  RANGE_WORDS,
  WORKBOOK_RANGE_SOURCES_MAX,
  WorkbookRecord,
  type ImportAnswer,
  type SheetJson,
} from '@livedoc/sheets';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';
import { readConnectSources, readInRoom } from './sheet-range-import';
import { answerRangeRead, RANGE_MEMO_MAX, RANGE_SOURCE_CELLS_MAX } from './sheet-range-read';

const IDENTITY = {
  sessionAccountId: null,
  verifiedAccountId: null,
  accountEmail: null,
  sessionAuthTime: null,
  owner: 'owner',
  token: null,
  workbench: null,
};
import { documentRouteContext } from '../document-room/document-route';

let kit: WorkbookKit;
const CONNECT: ImportAnswer = { error: '#REF!', why: RANGE_WORDS.connect, connect: true };
const PERMISSION = { error: '#REF!', why: RANGE_WORDS.permission };
const NOT_FOUND = { error: '#REF!', why: RANGE_WORDS.notFound };

const f = (t: string) => ({ f: { t, r: [] } });

// A spreadsheet whose first sheet holds `cells` by A1 (row 1 to 10, columns A to D).
function spreadsheet(id: string, cells: Record<string, SheetJson['cells'][number]['i']>) {
  const doc = kit.document(id, true);
  const { layout } = kit;
  const at = (a1: string) => ({
    r: layout.rows[Number(a1.slice(1)) - 1]!,
    c: layout.cols[a1.charCodeAt(0) - 65]!,
  });
  (doc.sheets as SheetJson[])[0]!.cells = Object.entries(cells).map(([a1, i]) => ({
    ...at(a1),
    i,
  }));
  return kit.call({ path: '', body: doc });
}

const read = (source: string, range: string, extra: { owner?: string; code?: string } = {}) =>
  kit.call({
    method: 'GET',
    path: `/book1/workbook/imports?${importParams({ kind: 'range', source, range }).toString()}`,
    ...extra,
  });
const answer = async (source: string, range: string, extra = {}) =>
  (await read(source, range, extra)).json<ImportAnswer>();
const connect = (body: unknown, extra: { owner?: string; code?: string; id?: string } = {}) =>
  kit.call({
    method: 'POST',
    path: `/${extra.id ?? 'book1'}/workbook/imports`,
    body,
    ...(extra.owner ? { owner: extra.owner } : {}),
    ...(extra.code ? { code: extra.code } : {}),
  });

beforeEach(async () => {
  kit = workbookKit();
  expect((await spreadsheet('book1', { A1: { n: 7 } })).status).toBe(201);
  expect(
    (await spreadsheet('src1', { A1: { n: 1 }, B1: { s: 'x' }, A2: f('1/0'), D1: { b: true } }))
      .status,
  ).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('VIEW', 'book1', 'view', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'book1', 'edit', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'book1', 'edit', 'book1t', 1);",
  );
  kit.relayed.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('connecting two spreadsheets', () => {
  it('asks to connect a source the reader may open, and says so of one they may not', async () => {
    expect(await answer('src1', 'A1')).toEqual(CONNECT);
    expect(await answer('src1', 'A1', { owner: 'v', code: 'VIEW' })).toEqual(PERMISSION);
    expect(await answer('nowhere', 'A1')).toEqual(PERMISSION);
  });

  it('is an Editor’s, for good, kept with the workbook and sent live', async () => {
    expect((await connect({ sources: ['src1'] }, { owner: 'v', code: 'VIEW' })).status).toBe(403);
    const res = await connect({ sources: ['src1', 'src1', 'book1'] });
    expect(res.status).toBe(200);
    const body = await res.json<WorkbookSettingsResponse>();
    expect(body.workbook.rangeSources).toEqual(['src1']);
    expect(kit.relayed).toEqual([{ kind: 'workbook', workbook: body.workbook, rev: body.rev }]);
    const again = await (await connect({ sources: ['src1'] })).json<WorkbookSettingsResponse>();
    expect(again.workbook.rangeSources).toEqual(['src1']);
    expect(await answer('src1', 'A1')).toEqual({ values: [[1]] });
  });

  it('connects only the sources the Editor may open, refusing when none', async () => {
    expect((await connect({ sources: ['nowhere'] })).status).toBe(403);
    const res = await connect({ sources: ['nowhere', 'src1'] });
    expect((await res.json<WorkbookSettingsResponse>()).workbook.rangeSources).toEqual(['src1']);
  });

  it.each([
    [{ sources: 'src1' }],
    [{ sources: [] }],
    [{ sources: [1] }],
    [{ sources: ['https://docs.nu/document/src1'] }],
    [{ sources: Array.from({ length: WORKBOOK_RANGE_SOURCES_MAX + 1 }, (_, i) => `s${i}`) }],
    [[]],
    ['not json'],
  ])('refuses %j as no sources', async (body) => {
    const res =
      body === 'not json'
        ? await kit.call({ method: 'POST', path: '/book1/workbook/imports', body: '{' })
        : await connect(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'range_sources_invalid' });
  });

  it('refuses past the sources a workbook keeps, a tab-scoped link and no spreadsheet', async () => {
    const many = Array.from({ length: WORKBOOK_RANGE_SOURCES_MAX }, (_, i) => `s${i}`);
    kit.sql.sql.exec(
      `UPDATE workbook SET range_sources = '${JSON.stringify(many)}' WHERE document_id = 'book1'`,
    );
    expect((await connect({ sources: ['src1'] })).status).toBe(409);
    expect((await connect({ sources: ['src1'] }, { owner: 't', code: 'TAB1' })).status).toBe(404);
    await kit.call({ path: '', body: kit.document('plan1', false) });
    expect((await connect({ sources: ['src1'] }, { id: 'plan1' })).status).toBe(404);
  });

  it('still allows the web without a body', async () => {
    const res = await kit.call({ method: 'POST', path: '/book1/workbook/imports' });
    expect((await res.json<WorkbookSettingsResponse>()).workbook.importsAllowed).toBe(true);
  });
});

describe('reading a source', () => {
  beforeEach(async () => {
    await connect({ sources: ['src1'] });
  });

  it('answers the source’s values, errors by their code, its first sheet without a name', async () => {
    expect(await answer('src1', 'Sheet1!A1:B2')).toEqual({
      values: [
        [1, 'x'],
        [{ e: '#DIV/0!' }, null],
      ],
    });
    expect(await answer('src1', 'D1')).toEqual({ values: [[true]] });
    expect(await answer('src1', 'A:A')).toEqual({ values: [[1], [{ e: '#DIV/0!' }]] });
  });

  it('reads with each reader’s own access, never the connection’s', async () => {
    expect(await answer('src1', 'A1', { owner: 'v', code: 'VIEW' })).toEqual(PERMISSION);
  });

  it.each(['Nope!A1', 'Z1', 'NoName'])('cannot find %s', async (range) => {
    expect(await answer('src1', range)).toEqual(NOT_FOUND);
  });

  it('cannot find a range in a document that is no spreadsheet', async () => {
    await kit.call({ path: '', body: kit.document('plan1', false) });
    await connect({ sources: ['plan1'] });
    expect(await answer('plan1', 'A1')).toEqual(NOT_FOUND);
  });

  it('reads itself without connecting', async () => {
    expect(await answer('book1', 'A1')).toEqual({ values: [[7]] });
  });

  it('keeps an answer while the source is unchanged, and reads it again once it changes', async () => {
    const info = vi.spyOn(console, 'info');
    await answer('src1', 'A1');
    await answer('src1', 'A1');
    expect(info.mock.calls.some(([line]) => String(line).startsWith('[imports] range kept'))).toBe(
      true,
    );
    const { layout } = kit;
    await kit.write('src1', {
      kind: 'cells',
      cells: [{ r: layout.rows[0]!, c: layout.cols[0]!, i: { n: 5 } }],
    });
    expect(await answer('src1', 'A1')).toEqual({ values: [[5]] });
  });

  it('refuses an import that is none, and a document that is no spreadsheet', async () => {
    const res = await kit.call({
      method: 'GET',
      path: '/book1/workbook/imports?kind=range&source=src1',
    });
    expect(res.status).toBe(400);
    await kit.call({ path: '', body: kit.document('plan1', false) });
    const plan = await kit.call({
      method: 'GET',
      path: `/plan1/workbook/imports?${importParams({ kind: 'range', source: 'src1', range: 'A1' }).toString()}`,
    });
    expect(plan.status).toBe(404);
  });

  it('is limited per spreadsheet', async () => {
    (kit.sql.env as unknown as Record<string, unknown>).SHEET_IMPORT_RATE_LIMITER = {
      limit: async () => ({ success: false }),
    };
    expect((await read('src1', 'A1')).status).toBe(429);
  });
});

describe('a chain of spreadsheets', () => {
  it('reads a source’s own IMPORTRANGE once it is connected, and refuses a loop', async () => {
    await spreadsheet('src2', {
      A1: f('IMPORTRANGE("src3", "A1")'),
      B1: f('IMPORTRANGE("src1", "A1")'),
    });
    await spreadsheet('src3', { A1: { n: 3 }, B1: f('IMPORTRANGE("book1", "A1")') });
    await connect({ sources: ['src2'] });
    expect(await answer('src2', 'A1')).toEqual({ values: [[{ e: '#REF!' }]] });
    await connect({ sources: ['src3', 'book1'] }, { id: 'src2' });
    await connect({ sources: ['book1'] }, { id: 'src3' });
    expect(await answer('src2', 'A1')).toEqual({ values: [[3]] });
    // src2 reads src3 reads book1: book1 is the asker, so the loop is refused.
    await connect({ sources: ['src2'] }, { id: 'src3' });
    expect(await answer('src3', 'B1')).toEqual(CONNECT);
    await connect({ sources: ['src3'] });
    expect(await answer('src3', 'B1')).toEqual({ values: [[{ e: '#REF!' }]] });
  });

  it('stops at the depth', async () => {
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5'];
    for (const [i, id] of ids.entries())
      await spreadsheet(id, {
        A1: i < ids.length - 1 ? f(`IMPORTRANGE("${ids[i + 1]}", "A1")`) : { n: 9 },
      });
    for (const [i, id] of ids.slice(0, -1).entries())
      await connect({ sources: [ids[i + 1]!] }, { id });
    await connect({ sources: ['c1'] });
    expect(await answer('c1', 'A1')).toEqual({ values: [[{ e: '#REF!' }]] });
    expect(await answer('c3', 'A1')).toEqual(CONNECT);
  });
});

describe('the bounds', () => {
  it('refuses a range past the largest array', async () => {
    const doc = kit.document('big1', true);
    const sheet = (doc.sheets as SheetJson[])[0]!;
    let n = 3;
    sheet.layout = emptyLayout(() => (n = (n * 48271) % 2147483647) / 2147483647, 1000, 120);
    await kit.call({ path: '', body: doc });
    await connect({ sources: ['big1'] });
    expect(await answer('big1', 'A1:DP1000')).toEqual({
      error: '#ERROR!',
      why: RANGE_WORDS.tooLarge,
    });
  });

  it('refuses a source holding more cells than are worked out here', async () => {
    await connect({ sources: ['src1'] });
    kit.sql.sql.exec(
      `UPDATE sheets SET cell_count = ${RANGE_SOURCE_CELLS_MAX + 1} WHERE document_id = 'src1'`,
    );
    // A range no earlier read kept (answers are kept by the room while their source's version holds).
    expect(await answer('src1', 'C3')).toEqual({ error: '#ERROR!', why: RANGE_WORDS.tooLarge });
  });

  it('says so when the source’s room cannot be reached', async () => {
    const env = {
      ...kit.sql.env,
      DOCUMENT_ROOM: {
        idFromName: (x: string) => x,
        get: () => ({
          readRange: async () => {
            throw new Error('gone');
          },
        }),
      },
    } as unknown as Parameters<typeof readInRoom>[0];
    const identity = { owner: 'owner' } as Parameters<typeof readInRoom>[3];
    expect(await readInRoom(env, 'src1', { range: 'A1', path: [] }, identity)).toEqual({
      error: '#N/A',
      why: RANGE_WORDS.unreadable,
    });
  });

  it('answers an empty spreadsheet as no range', async () => {
    kit.sql.sql.exec("DELETE FROM document_tabs WHERE document_id = 'src1'");
    const ctx = documentRouteContext(
      kit.sql.env,
      new Request('https://room/api/documents/src1/workbook'),
      {
        sessionAccountId: null,
        verifiedAccountId: null,
        accountEmail: null,
        sessionAuthTime: null,
        owner: 'owner',
        token: null,
        workbench: null,
      },
      undefined,
    );
    expect(
      await answerRangeRead(ctx, 'src1', { range: 'A1', path: [] }, async () => CONNECT),
    ).toEqual(NOT_FOUND);
  });

  it('answers a range string the source cannot compile as no range', async () => {
    await connect({ sources: ['src1'] });
    const ctx = documentRouteContext(
      kit.sql.env,
      new Request('https://room/api/documents/src1/workbook'),
      { ...IDENTITY },
      undefined,
    );
    expect(
      await answerRangeRead(ctx, 'src1', { range: 'A1:', path: ['book1'] }, async () => CONNECT),
    ).toEqual(NOT_FOUND);
  });

  it('keeps at most RANGE_MEMO_MAX answers, the oldest let go', async () => {
    await connect({ sources: ['src1'] });
    await answer('src1', 'A2:A2');
    const others: string[] = [];
    for (let r = 1; r <= 10; r++)
      for (let t = r; t <= 10; t++) others.push(`A${r}:D${t}`, `B${r}:C${t}`);
    for (const range of others.slice(0, RANGE_MEMO_MAX)) await answer('src1', range);
    const info = vi.spyOn(console, 'info');
    await answer('src1', 'A2:A2');
    const lines = info.mock.calls.map(([line]) => String(line));
    expect(lines.some((line) => line.startsWith('[imports] range read'))).toBe(true);
  });
});

describe('readConnectSources', () => {
  it('reads ids once each', () => {
    expect(readConnectSources({ sources: ['a', 'b', 'a'] })).toEqual(['a', 'b']);
    expect(readConnectSources(null)).toBeNull();
  });
});

describe('the room’s column', () => {
  it.each(['not json', '[]', '[1]'])('reads %j as no sources, warning', async (text) => {
    const warn = vi.spyOn(console, 'warn');
    kit.sql.sql.exec(`UPDATE workbook SET range_sources = '${text}' WHERE document_id = 'book1'`);
    const res = await kit.call({ method: 'GET', path: '/book1' });
    const { document } = await res.json<{ document: { workbook?: WorkbookRecord } }>();
    expect(document.workbook?.rangeSources).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[workbook] unreadable range sources', {
      documentId: 'book1',
    });
  });
});

describe('the record', () => {
  it('keeps the sources it reads', () => {
    const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
    expect(WorkbookRecord.read({ ...record, rangeSources: ['a'] })?.rangeSources).toEqual(['a']);
    expect(WorkbookRecord.read({ ...record, rangeSources: ['a', 'a'] })).toBeNull();
  });
});

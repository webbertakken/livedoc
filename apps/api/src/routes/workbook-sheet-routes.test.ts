import { beforeEach, describe, expect, it } from 'vitest';
import type {
  DocumentResponse,
  SheetsResponse,
  WorkbookSettingsResponse,
  WorkbookSheetAddResponse,
  WorkbookSheetRenameResponse,
} from '@livedoc/api-schema';
import { WorkbookRecord, type WorkbookSettings } from '@livedoc/sheets';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';

// docs/specs/029-sheets/sheet-store.md "Changing the workbook": a spreadsheet's sheets added, renamed and deleted with
// their tabs, and its settings saved, through the api.

let kit: WorkbookKit;

const made = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/London' });

async function tabsOf(id: string): Promise<{ id: string; name: string }[]> {
  const res = await kit.call({ method: 'GET', path: `/${id}` });
  const { document } = await res.json<DocumentResponse>();
  return [...document.tabs]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((t) => ({ id: t.id, name: t.name }));
}

const add = (body: unknown = {}, id = 'book1') =>
  kit.call({ path: `/${id}/workbook/sheets`, body });

const kinds = () => kit.relayed.map((op) => (op as { kind: string }).kind);

beforeEach(async () => {
  kit = workbookKit();
  expect((await kit.call({ path: '', body: kit.document('book1', true) })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'book1', 'edit', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, level, tab_id, created_at) VALUES ('PART', 'book1', 'view', 'participate', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'book1', 'edit', 'book1t', 1);",
  );
  kit.relayed.length = 0;
});

describe('adding a sheet', () => {
  it('makes a sheet tab and its sheet as one, named Sheet<n>, 1,000 rows by 26 columns, last', async () => {
    const res = await add();
    expect(res.status).toBe(201);
    const { tab, sheet } = await res.json<WorkbookSheetAddResponse>();
    expect(tab).toEqual({ id: expect.any(String), name: 'Sheet2', orderIndex: 1 });
    expect(sheet).toMatchObject({ tabId: tab.id, title: 'Sheet2', cells: [] });
    expect([sheet.layout.rows.length, sheet.layout.cols.length]).toEqual([1_000, 26]);
    // Google's line sizes, the sheet's own (D169).
    expect([sheet.layout.colWidth, sheet.layout.rowHeight]).toEqual([100, 21]);
    expect(await tabsOf('book1')).toEqual([
      { id: 'book1t', name: 'Sheet1' },
      { id: tab.id, name: 'Sheet2' },
    ]);
    expect((await kit.sheets('book1')).map((s) => s.title)).toEqual(['Sheet1', 'Sheet2']);
  });

  it('goes after the tab named, moving the rest along', async () => {
    const third = await (await add({ name: 'Costs' })).json<WorkbookSheetAddResponse>();
    const res = await add({ name: 'Budget', after: 'book1t' });
    const { tab } = await res.json<WorkbookSheetAddResponse>();
    expect(tab.orderIndex).toBe(1);
    expect((await tabsOf('book1')).map((t) => t.name)).toEqual(['Sheet1', 'Budget', 'Costs']);
    expect(third.tab.name).toBe('Costs');
  });

  it('goes first when the tab it follows is empty', async () => {
    const { tab } = await (
      await add({ name: 'Front', after: '' })
    ).json<WorkbookSheetAddResponse>();
    expect(tab.orderIndex).toBe(0);
    expect((await tabsOf('book1')).map((t) => t.name)).toEqual(['Front', 'Sheet1']);
  });

  it('takes the ids it is given', async () => {
    const res = await add({ tabId: 'tab-two', sheetId: 'sheetTwo1' });
    const { tab, sheet } = await res.json<WorkbookSheetAddResponse>();
    expect([tab.id, sheet.id]).toEqual(['tab-two', 'sheetTwo1']);
  });

  it('sends the tab list, then the sheet, to the room', async () => {
    const { sheet } = await (await add()).json<WorkbookSheetAddResponse>();
    expect(kinds()).toEqual(['document-meta', 'sheets']);
    const meta = kit.relayed[0] as { tabs: { name: string }[] };
    expect(meta.tabs.map((t) => t.name)).toEqual(['Sheet1', 'Sheet2']);
    expect(kit.relayed[1]).toMatchObject({ sheetId: sheet.id, created: true });
  });

  it.each([
    ['a name against the rules', { name: 'Q3/Q4' }, 400, 'sheet_name_invalid'],
    ['a name another sheet has, case aside', { name: 'sheet1' }, 409, 'sheet_name_taken'],
    ['a tab it should follow that is not there', { after: 'nope' }, 404, 'tab_not_found'],
    ['a tab id taken', { tabId: 'book1t' }, 409, 'sheet_exists'],
    ['a tab id of another alphabet', { tabId: 'a b' }, 400, 'write_invalid'],
    ['a sheet id that is none', { sheetId: 'x' }, 400, 'write_invalid'],
    ['a name that is not text', { name: 3 }, 400, 'write_invalid'],
    ['a body that is a list', [], 400, 'write_invalid'],
    ['a body that is no JSON object', 'Sheet2', 400, 'write_invalid'],
  ])('refuses %s', async (_, body, status, error) => {
    const res = await add(body);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(await tabsOf('book1')).toHaveLength(1);
  });

  it('refuses a sheet past the grid, leaving no tab', async () => {
    // Two more sheets of 1,000 rows by 10,000 columns: 20 million grid cells, so 26,000 more pass the limit.
    storedSheet('bigSheet1', 'Big1', 1_000, 10_000);
    storedSheet('bigSheet2', 'Big2', 1_000, 10_000);
    const res = await add();
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'workbook_full' });
    expect(await tabsOf('book1')).toHaveLength(3);
  });

  it('refuses a sheet past 200, leaving no tab', async () => {
    for (let i = 0; i < 199; i++) storedSheet(`sheet${String(i).padStart(4, '0')}`, `S${i}`, 1, 1);
    const res = await add();
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'sheets_full' });
    expect(await tabsOf('book1')).toHaveLength(200);
  });

  it('refuses a document that is no spreadsheet', async () => {
    await kit.call({ path: '', body: kit.document('plan1', false) });
    const res = await add({}, 'plan1');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'workbook_not_found' });
  });

  it("is an Editor's: a Participant and a tab-scoped link are refused", async () => {
    expect(
      (await kit.call({ path: '/book1/workbook/sheets', owner: 'p', code: 'PART' })).status,
    ).toBe(403);
    expect(
      (await kit.call({ path: '/book1/workbook/sheets', owner: 'p', code: 'TAB1' })).status,
    ).toBe(404);
    const editor = await kit.call({
      path: '/book1/workbook/sheets',
      owner: 'e',
      code: 'EDIT',
      body: {},
    });
    expect(editor.status).toBe(201);
  });
});

describe('duplicating a sheet', () => {
  it('copies its layout and cells after it, named Copy of <name>, then Copy of <name> 2', async () => {
    const cell = { r: kit.layout.rows[0]!, c: kit.layout.cols[0]!, i: { n: 7 } };
    await kit.call({ path: '', body: kit.document('book2', true, [cell]) });
    await add({ name: 'Last' }, 'book2');
    const res = await add({ copyOf: 'book2Sheet' }, 'book2');
    expect(res.status).toBe(201);
    const { tab, sheet } = await res.json<WorkbookSheetAddResponse>();
    expect(tab).toMatchObject({ name: 'Copy of Sheet1', orderIndex: 1 });
    expect(sheet).toMatchObject({ title: 'Copy of Sheet1', tabId: tab.id, rev: 0 });
    expect(sheet.cells).toEqual([cell]);
    expect(sheet.layout.rows).toEqual(kit.layout.rows);
    const again = await (
      await add({ copyOf: 'book2Sheet' }, 'book2')
    ).json<WorkbookSheetAddResponse>();
    expect(again.tab.name).toBe('Copy of Sheet1 2');
    expect((await tabsOf('book2')).map((t) => t.name)).toEqual([
      'Sheet1',
      'Copy of Sheet1 2',
      'Copy of Sheet1',
      'Last',
    ]);
    // Referenced by its tab, the copy never waits to expire.
    const row = kit.sql.sql
      .prepare('SELECT unreferenced_since FROM sheets WHERE id = ?')
      .get(sheet.id) as { unreferenced_since: number | null };
    expect(row.unreferenced_since).toBeNull();
  });

  it('takes the name, the place and the ids it is given', async () => {
    const res = await add({
      copyOf: 'book1Sheet',
      name: 'Plan B',
      after: 'book1t',
      sheetId: 'sheetDup1',
    });
    const { tab, sheet } = await res.json<WorkbookSheetAddResponse>();
    expect([tab.name, sheet.id]).toEqual(['Plan B', 'sheetDup1']);
  });

  it('refuses a sheet that is not on a tab, or a copy id that is no sheet id', async () => {
    const gone = await add({ copyOf: 'missing00' });
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: 'sheet_not_found' });
    expect((await add({ copyOf: 'x' })).status).toBe(400);
    expect(await tabsOf('book1')).toHaveLength(1);
  });

  it('refuses a copy past the grid, leaving no tab', async () => {
    storedSheet('bigSheet1', 'Big1', 1_000, 10_000);
    const res = await add({ copyOf: 'bigSheet1' });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'workbook_full' });
    expect(await tabsOf('book1')).toHaveLength(2);
  });

  it("refuses a copy whose cells pass the document's", async () => {
    kit.sql.sql.exec("UPDATE sheets SET cell_count = 20000000 WHERE id = 'book1Sheet'");
    const res = await add({ copyOf: 'book1Sheet' });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'sheets_full' });
  });
});

describe('renaming a sheet', () => {
  const rename = (name: unknown, sheet = 'book1Sheet') =>
    kit.call({ path: `/book1/workbook/sheets/${sheet}/rename`, body: { name } });

  it('renames the sheet and its tab as one', async () => {
    const res = await rename('  Budget ');
    expect(res.status).toBe(200);
    expect(await res.json<WorkbookSheetRenameResponse>()).toEqual({
      tabId: 'book1t',
      sheetId: 'book1Sheet',
      name: 'Budget',
      rev: 1,
    });
    expect(await tabsOf('book1')).toEqual([{ id: 'book1t', name: 'Budget' }]);
    expect((await kit.sheets('book1'))[0]!.title).toBe('Budget');
    expect(kinds()).toContain('tab-meta');
  });

  it.each([
    ['a name against the rules', "'Q3", 400, 'sheet_name_invalid'],
    ['no name', undefined, 400, 'sheet_name_invalid'],
  ])('refuses %s', async (_, name, status, error) => {
    const res = await rename(name);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("refuses another sheet's name", async () => {
    await add({ name: 'Costs' });
    const res = await rename('COSTS');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'sheet_name_taken' });
  });

  it('refuses a sheet that is not there', async () => {
    const res = await rename('Budget', 'sheetNone');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'sheet_not_found' });
  });
});

describe('deleting a sheet', () => {
  const remove = (sheet: string) =>
    kit.call({ method: 'DELETE', path: `/book1/workbook/sheets/${sheet}` });

  it('removes its tab and keeps its sheet, unreferenced, for Undo', async () => {
    const { sheet } = await (await add({ name: 'Costs' })).json<WorkbookSheetAddResponse>();
    kit.relayed.length = 0;
    expect((await remove(sheet.id)).status).toBe(204);
    expect((await tabsOf('book1')).map((t) => t.name)).toEqual(['Sheet1']);
    const kept = kit.sql.sql
      .prepare('SELECT unreferenced_since FROM sheets WHERE id = ?')
      .all(sheet.id) as { unreferenced_since: number | null }[];
    expect(kept[0]!.unreferenced_since).not.toBeNull();
    expect(kinds()).toEqual(['document-meta', 'sheets']);
    expect(kit.relayed[1]).toMatchObject({ sheetId: sheet.id, deleted: true });
  });

  it('never deletes the last visible sheet', async () => {
    const res = await remove('book1Sheet');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'sheet_last_visible' });
    expect(await tabsOf('book1')).toHaveLength(1);
  });

  it('puts a deleted sheet back as it was when added with its ids', async () => {
    const { tab, sheet } = await (await add({ name: 'Costs' })).json<WorkbookSheetAddResponse>();
    await kit.write('book1', {
      kind: 'title',
      title: 'Sheet1',
    });
    await remove(sheet.id);
    const res = await add({ tabId: tab.id, sheetId: sheet.id });
    expect(res.status).toBe(201);
    const back = await res.json<WorkbookSheetAddResponse>();
    expect(back.tab).toEqual({ id: tab.id, name: 'Costs', orderIndex: 1 });
    expect(back.sheet.id).toBe(sheet.id);
    const kept = kit.sql.sql
      .prepare('SELECT unreferenced_since FROM sheets WHERE id = ?')
      .all(sheet.id) as { unreferenced_since: number | null }[];
    expect(kept[0]!.unreferenced_since).toBeNull();
  });

  it('refuses to put back a sheet still on its tab, or under another tab', async () => {
    const { tab, sheet } = await (await add()).json<WorkbookSheetAddResponse>();
    expect((await add({ tabId: tab.id, sheetId: sheet.id })).status).toBe(409);
    await remove(sheet.id);
    const res = await add({ tabId: 'other-tab', sheetId: sheet.id });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'sheet_exists' });
  });

  it('refuses to put back a sheet whose name another sheet took meanwhile', async () => {
    const { tab, sheet } = await (await add({ name: 'Costs' })).json<WorkbookSheetAddResponse>();
    await remove(sheet.id);
    await add({ name: 'costs' });
    const res = await add({ tabId: tab.id, sheetId: sheet.id });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'sheet_name_taken' });
  });

  it('refuses a sheet that is not on a tab', async () => {
    const res = await remove('sheetNone');
    expect(res.status).toBe(404);
  });
});

describe('saving the settings', () => {
  const save = (settings: unknown, extra: Partial<Parameters<WorkbookKit['call']>[0]> = {}) =>
    kit.call({ method: 'PUT', path: '/book1/workbook/settings', body: { settings }, ...extra });

  const changed: WorkbookSettings = {
    locale: 'nl-NL',
    timeZone: 'Europe/Amsterdam',
    recalc: 'minute',
    iterate: { on: true, max: 100, threshold: 0.001 },
  };

  it('saves them whole, answers the new rev, and sends them live', async () => {
    const res = await save(changed);
    expect(res.status).toBe(200);
    expect(await res.json<WorkbookSettingsResponse>()).toEqual({
      workbook: { format: 'ods', settings: changed },
      rev: 1,
    });
    const read = await kit.call({ method: 'GET', path: '/book1' });
    expect((await read.json<DocumentResponse>()).document.workbook?.settings).toEqual(changed);
    expect(kit.relayed).toEqual([
      { kind: 'workbook', workbook: { format: 'ods', settings: changed }, rev: 1 },
    ]);
  });

  it.each([
    ['an unknown recalculation', { ...changed, recalc: 'second' }],
    ['a locale no runtime knows', { ...changed, locale: 'not a locale!' }],
    ['a time zone no runtime knows', { ...changed, timeZone: 'Mars/Olympus' }],
    ['too many iterations', { ...changed, iterate: { on: true, max: 1_001, threshold: 0 } }],
    ['nothing', undefined],
  ])('refuses %s', async (_, settings) => {
    const res = await save(settings);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'settings_invalid' });
    const read = await kit.call({ method: 'GET', path: '/book1' });
    expect((await read.json<DocumentResponse>()).document.workbook?.settings).toEqual(
      made.settings,
    );
  });

  it("is an Editor's", async () => {
    expect((await save(changed, { owner: 'p', code: 'PART' })).status).toBe(403);
    expect((await save(changed, { owner: 'p', code: 'TAB1' })).status).toBe(404);
    expect((await save(changed, { owner: 'e', code: 'EDIT' })).status).toBe(200);
  });

  it('refuses a document that is no spreadsheet', async () => {
    await kit.call({ path: '', body: kit.document('plan1', false) });
    const res = await kit.call({
      method: 'PUT',
      path: '/plan1/workbook/settings',
      body: { settings: changed },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'workbook_not_found' });
  });

  it('answers another method as not allowed', async () => {
    expect((await kit.call({ method: 'POST', path: '/book1/workbook/settings' })).status).toBe(405);
    expect((await kit.call({ method: 'GET', path: '/book1/workbook/sheets' })).status).toBe(405);
    expect(
      (await kit.call({ method: 'GET', path: '/book1/workbook/sheets/book1Sheet/rename' })).status,
    ).toBe(405);
  });
});

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(6, '0')}`);

// A sheet stored on a tab of its own, its order in its layout as one stored before the chunks: only its counts matter.
function storedSheet(id: string, title: string, rows: number, cols: number): void {
  const layout = JSON.stringify({ rows: ids('r', rows), cols: ids('c', cols) });
  const tabId = `${id}Tab`;
  kit.sql.sql
    .prepare(
      `INSERT INTO tabs (id, name, data, updated_at) VALUES (?, ?, '{"kind":"sheet","elements":[]}', 1)`,
    )
    .run(tabId, title);
  kit.sql.sql
    .prepare(
      `INSERT INTO document_tabs (document_id, tab_id, order_index, added_at)
       VALUES ('book1', ?, (SELECT MAX(order_index) + 1 FROM document_tabs WHERE document_id = 'book1'), 1)`,
    )
    .run(tabId);
  kit.sql.sql
    .prepare(
      `INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
       VALUES ('book1', ?, ?, ?, ?, 0, 1, 1, '{}')`,
    )
    .run(id, tabId, title, layout);
}

// sheet-store.md "Changing the workbook": the sheet list of a spreadsheet is its tabs' sheets, in tab order, with its
// workbook row, so an agent reads the whole workbook in one request.
describe("a spreadsheet's sheet list", () => {
  it('lists the sheets of its tabs in tab order, with the workbook, leaving out a deleted tab', async () => {
    const costs = await (await add({ name: 'Costs' })).json<WorkbookSheetAddResponse>();
    await add({ name: 'Budget', after: 'book1t' });
    await kit.call({ method: 'DELETE', path: `/book1/workbook/sheets/${costs.sheet.id}` });
    const res = await kit.call({ method: 'GET', path: '/book1/sheets' });
    const body = await res.json<SheetsResponse>();
    expect(body.sheets.map((s) => s.title)).toEqual(['Sheet1', 'Budget']);
    expect(body.workbook).toEqual(made);
  });

  it('carries no workbook for a document that is no spreadsheet', async () => {
    await kit.call({ path: '', body: kit.document('plan1', false) });
    const res = await kit.call({ method: 'GET', path: '/plan1/sheets' });
    expect((await res.json<SheetsResponse>()).workbook).toBeNull();
  });
});

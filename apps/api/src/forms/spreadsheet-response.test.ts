import { beforeEach, describe, expect, it } from 'vitest';
import type { FormLinkResponse, PublicFormResponse } from '@livedoc/api-schema';
import type { FormDefinition } from '@livedoc/forms';
import { WorkbookRecord } from '@livedoc/sheets';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { listItems } from '../db';
import { insertWorkbookStatement, readWorkbook } from '../db/workbook';
import { documentRpc, type DocumentRoomRpc } from '../document-room/document-rpc';
import { makeTestRouteContext } from '../routes/test-route-context';
import { handleDocuments } from '../routes/documents';
import { handleForms } from '../routes/forms';

// A form's responses into a spreadsheet's sheet (docs/specs/029-sheets/plan-links.md "Form responses", D506): the
// connection an Editor of both makes, each response checked against it in the spreadsheet's room, and Unlink Form.

let sql: SqliteD1;
const SHEET = 'shtSSSSSS001';
const OTHER_SHEET = 'shtSSSSSS002';

const form = (extra: Partial<FormDefinition> = {}): FormDefinition => ({
  v: 1,
  heading: 'Feedback',
  sections: [
    {
      id: 's-1',
      title: '',
      questions: [{ id: 'q-say', type: 'short', prompt: 'Say', required: true }],
    },
  ],
  sheet: { documentId: 'ss1', sheetId: SHEET },
  ...extra,
});

function writeForm(f: FormDefinition) {
  sql.sql
    .prepare(`UPDATE tabs SET data = ?, rev = rev + 1 WHERE id = 'ftab'`)
    .run(JSON.stringify({ kind: 'form', opensIn: 'plan', elements: [], form: f }));
}

async function call<T = unknown>(
  method: string,
  path: string,
  opts: { owner?: string; body?: unknown } = {},
) {
  const pending: Promise<unknown>[] = [];
  const ctx = makeTestRouteContext(method, `/api/documents/${path}`, {
    env: sql.env,
    owner: opts.owner ?? 'owner',
    ...(opts.body === undefined ? {} : { body: opts.body }),
    waitUntil: (p) => void pending.push(p),
  });
  const res = await handleDocuments(ctx);
  await Promise.all(pending);
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function pub<T = unknown>(method: string, path: string, body?: unknown) {
  const pending: Promise<unknown>[] = [];
  const ctx = makeTestRouteContext(method, `/api/forms/${path}`, {
    env: sql.env,
    owner: null,
    ...(body === undefined ? {} : { body }),
    headers: { 'CF-Connecting-IP': '203.0.113.9' },
    waitUntil: (p) => void pending.push(p),
  });
  const res = await handleForms(ctx);
  await Promise.all(pending);
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

const connect = (owner = 'owner', sheet = SHEET) =>
  call('POST', 'ss1/workbook/link', { owner, body: { document: 'd1', tab: 'ftab', sheet } });

async function publish(): Promise<string> {
  const res = await call<FormLinkResponse>('POST', 'd1/tabs/ftab/form-link');
  expect(res.status).toBe(200);
  return res.body.link!.code;
}

const cellsOf = (sheetId: string) =>
  sql.sql
    .prepare(`SELECT row_id, input FROM sheet_cells WHERE document_id = 'ss1' AND sheet_id = ?`)
    .all(sheetId) as { row_id: string; input: string }[];
const texts = (sheetId: string) => cellsOf(sheetId).map((c) => JSON.parse(c.input) as unknown);

beforeEach(() => {
  sql = sqliteD1();
  // Every room is this one SQLite; another document's room answers as the room's own RPC does.
  const rpc = () => documentRpc(sql.env, undefined);
  (sql.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
    idFromName: (n: string) => n,
    get: () => ({
      fetch: async () => new Response(null, { status: 204 }),
      formSheetThere: (...a: Parameters<DocumentRoomRpc['formSheetThere']>) =>
        rpc().formSheetThere(...a),
      writeFormResponse: (...a: Parameters<DocumentRoomRpc['writeFormResponse']>) =>
        rpc().writeFormResponse(...a),
    }),
  };
  sql.sql.exec(`
    INSERT INTO participants (id, name, color, created_at) VALUES ('owner', 'Webber', '#3b82f6', 1);
    INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES ('d1', 'owner', 'Ops', 1, 1, 1);
    INSERT INTO tabs (id, name, data, updated_at) VALUES ('ftab', 'Feedback', '{}', 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 'ftab', 0, 1);
    INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES ('ss1', 'owner', 'Feedback Responses', 1, 1, 1);
    INSERT INTO tabs (id, name, data, updated_at) VALUES ('sstab', 'Form Responses 1', '{"kind":"sheet"}', 1);
    INSERT INTO tabs (id, name, data, updated_at) VALUES ('sstab2', 'Other', '{"kind":"sheet"}', 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('ss1', 'sstab', 0, 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('ss1', 'sstab2', 1, 1);
    INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
      VALUES ('ss1', '${SHEET}', 'sstab', 'Form Responses 1', '{"rows":["ra01","ra02","ra03"],"cols":["ca01","ca02","ca03"]}', 0, 1, 1, '{}');
    INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
      VALUES ('ss1', '${OTHER_SHEET}', 'sstab2', 'Other', '{"rows":["rb01"],"cols":["cb01"]}', 0, 1, 1, '{}');
  `);
  void insertWorkbookStatement(
    sql.env,
    'ss1',
    WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' }),
    1,
  ).run();
  writeForm(form());
});

describe('connecting a form to a spreadsheet', () => {
  it('keeps the connection on the workbook, for an Editor of both', async () => {
    const res = await connect();
    expect(res.status).toBe(200);
    expect((await readWorkbook(sql.env, 'ss1'))?.forms).toEqual([
      { documentId: 'd1', tabId: 'ftab', sheetId: SHEET },
    ]);
  });

  it('moves a form connected again to its new sheet', async () => {
    await connect();
    expect((await connect('owner', OTHER_SHEET)).status).toBe(200);
    expect((await readWorkbook(sql.env, 'ss1'))?.forms).toEqual([
      { documentId: 'd1', tabId: 'ftab', sheetId: OTHER_SHEET },
    ]);
  });

  it('refuses someone who may not edit the spreadsheet or the form', async () => {
    expect((await connect('stranger')).status).toBeGreaterThanOrEqual(403);
    sql.sql.exec(`UPDATE documents SET owner_id = 'someone' WHERE id = 'd1'`);
    expect((await connect()).status).toBe(403);
    expect((await readWorkbook(sql.env, 'ss1'))?.forms).toBeUndefined();
  });

  it('refuses a body that names no form, a sheet not there, and itself', async () => {
    expect((await call('POST', 'ss1/workbook/link', { body: { document: 'd1' } })).status).toBe(
      400,
    );
    expect(
      (
        await call('POST', 'ss1/workbook/link', {
          body: { document: 'ss1', tab: 'sstab', sheet: SHEET },
        })
      ).status,
    ).toBe(400);
    expect((await connect('owner', 'shtNOTHERE01')).status).toBe(404);
  });
});

describe('responses into a spreadsheet', () => {
  it('will not publish before the form is connected', async () => {
    expect((await call('POST', 'd1/tabs/ftab/form-link')).status).toBe(409);
  });

  it('writes each response as a row of the connected sheet, no card', async () => {
    await connect();
    const code = await publish();
    expect((await pub<PublicFormResponse>('GET', code)).body.state).toBe('open');
    expect(await pub('POST', `${code}/responses`, { answers: { 'q-say': 'Lovely' } })).toEqual({
      status: 201,
      body: { number: 1 },
    });
    expect(texts(SHEET)).toContainEqual({ s: 'Say' });
    expect(texts(SHEET)).toContainEqual({ s: 'Lovely' });
    expect(await listItems(sql.env, 'd1')).toEqual([]);
  });

  it('previews an unpublished form into a Preview row', async () => {
    await connect();
    const res = await call('POST', 'd1/tabs/ftab/form-preview', {
      body: { answers: { 'q-say': 'Try' } },
    });
    expect(res).toEqual({ status: 201, body: { number: 0 } });
    expect(texts(SHEET)).toContainEqual({ s: 'Preview' });
  });

  it('pauses once Unlink Form takes the connection back', async () => {
    await connect();
    const code = await publish();
    expect((await call('DELETE', `ss1/workbook/link?sheet=${SHEET}`)).status).toBe(200);
    expect((await pub<PublicFormResponse>('GET', code)).body.state).toBe('closed');
    expect((await pub('POST', `${code}/responses`, { answers: { 'q-say': 'x' } })).status).toBe(
      409,
    );
    expect(cellsOf(SHEET)).toEqual([]);
  });

  it('writes nowhere a connection to another sheet does not admit', async () => {
    await connect('owner', OTHER_SHEET);
    expect((await call('POST', 'd1/tabs/ftab/form-link')).status).toBe(409);
  });

  it('pauses when the spreadsheet is trashed or its sheet deleted', async () => {
    await connect();
    const code = await publish();
    sql.sql.exec(`UPDATE documents SET trashed_at = 5 WHERE id = 'ss1'`);
    expect((await pub('POST', `${code}/responses`, { answers: { 'q-say': 'x' } })).status).toBe(
      409,
    );
    sql.sql.exec(`UPDATE documents SET trashed_at = NULL WHERE id = 'ss1'`);
    sql.sql.exec(`DELETE FROM document_tabs WHERE tab_id = 'sstab'`);
    expect((await pub<PublicFormResponse>('GET', code)).body.state).toBe('closed');
    expect(cellsOf(SHEET)).toEqual([]);
  });
});

describe('taking a connection back', () => {
  it("lets the form's Editor take its own connection back though they may not edit the spreadsheet", async () => {
    await connect();
    sql.sql.exec(`UPDATE documents SET owner_id = 'someone' WHERE id = 'ss1'`);
    expect((await call('DELETE', `ss1/workbook/link?sheet=${SHEET}`)).status).toBe(403);
    expect((await call('DELETE', 'ss1/workbook/link?document=d1&tab=ftab')).status).toBe(200);
    expect((await readWorkbook(sql.env, 'ss1'))?.forms).toBeUndefined();
  });

  it('refuses someone who may edit neither, and a query that names nothing', async () => {
    await connect();
    expect(
      (await call('DELETE', 'ss1/workbook/link?document=d1&tab=ftab', { owner: 'stranger' }))
        .status,
    ).toBeGreaterThanOrEqual(403);
    expect((await call('DELETE', 'ss1/workbook/link')).status).toBe(400);
    expect((await readWorkbook(sql.env, 'ss1'))?.forms).toHaveLength(1);
  });
});

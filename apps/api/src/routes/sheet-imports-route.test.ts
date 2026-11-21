// A spreadsheet's imports through the api (docs/specs/029-sheets/imports.md "Allow access", "The api's guards"):
// Allow Access by Editors, for good and live; the fetch for every reader once allowed, off unless the deployment turns
// it on, the hour's cache, a fresh ask, the per-spreadsheet rate and the guarded fetch's failures.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentResponse, WorkbookSettingsResponse } from '@livedoc/api-schema';
import { importParams, IMPORT_WORDS, type ImportRequest } from '@livedoc/sheets';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';

let kit: WorkbookKit;
const TABLE: ImportRequest = { kind: 'html', url: 'https://a.example/', query: 'table', index: 1 };
const PAGE = '<table><tr><td>1</td><td>x</td></tr></table>';

// The web the Worker sees: DNS over HTTPS and one page, counting the page's fetches.
let pageFetches = 0;
function stubWeb(body = PAGE): void {
  pageFetches = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.hostname === 'cloudflare-dns.com')
      return Response.json({
        Answer: url.searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [],
      });
    if (url.href !== 'https://a.example/') return new Response('', { status: 404 });
    pageFetches++;
    return new Response(body, { headers: { 'content-type': 'text/html' } });
  });
}

// The Workers cache, as a map.
function stubCache(): void {
  const held = new Map<string, string>();
  vi.stubGlobal('caches', {
    default: {
      match: async (req: Request) =>
        held.has(req.url) ? new Response(held.get(req.url)) : undefined,
      put: async (req: Request, res: Response) => void held.set(req.url, await res.text()),
    },
  });
}

const env = () => kit.sql.env as unknown as Record<string, unknown>;
const ask = (
  request: ImportRequest,
  extra: { owner?: string; code?: string; fresh?: boolean } = {},
) =>
  kit.call({
    method: 'GET',
    path: `/book1/workbook/imports?${importParams(request, extra.fresh).toString()}`,
    ...(extra.owner ? { owner: extra.owner } : {}),
    ...(extra.code ? { code: extra.code } : {}),
  });
const allow = (extra: { owner?: string; code?: string } = {}) =>
  kit.call({ method: 'POST', path: '/book1/workbook/imports', ...extra });

beforeEach(async () => {
  kit = workbookKit();
  expect((await kit.call({ path: '', body: kit.document('book1', true) })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'book1', 'edit', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('VIEW', 'book1', 'view', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'book1', 'edit', 'book1t', 1);",
  );
  kit.relayed.length = 0;
  env().SHEET_IMPORTS = 'on';
  stubWeb();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Allow Access', () => {
  it('is an Editor’s, for good, kept with the workbook and sent live', async () => {
    expect((await allow({ owner: 'v', code: 'VIEW' })).status).toBe(403);
    expect((await allow({ owner: 't', code: 'TAB1' })).status).toBe(404);
    const onTab = await kit.call({
      method: 'POST',
      path: '/book1/workbook/imports?tabId=book1t',
      owner: 't',
      code: 'TAB1',
    });
    expect(onTab.status).toBe(403);
    const res = await allow({ owner: 'e', code: 'EDIT' });
    expect(res.status).toBe(200);
    const body = await res.json<WorkbookSettingsResponse>();
    expect(body.workbook.importsAllowed).toBe(true);
    expect(kit.relayed).toEqual([{ kind: 'workbook', workbook: body.workbook, rev: body.rev }]);
    const read = await kit.call({ method: 'GET', path: '/book1' });
    expect((await read.json<DocumentResponse>()).document.workbook?.importsAllowed).toBe(true);
    expect((await allow()).status).toBe(200);
  });

  it('refuses a document that is no spreadsheet, and another method', async () => {
    await kit.call({ path: '', body: kit.document('plan1', false) });
    const res = await kit.call({ method: 'POST', path: '/plan1/workbook/imports' });
    expect(res.status).toBe(404);
    expect((await kit.call({ method: 'PUT', path: '/book1/workbook/imports' })).status).toBe(405);
  });

  it('survives a settings save', async () => {
    await allow();
    const settings = {
      locale: 'en-GB',
      timeZone: 'Europe/London',
      recalc: 'hour',
      iterate: { on: false, max: 50, threshold: 0.05 },
    };
    const saved = await kit.call({
      method: 'PUT',
      path: '/book1/workbook/settings',
      body: { settings },
    });
    expect((await saved.json<WorkbookSettingsResponse>()).workbook.importsAllowed).toBe(true);
  });
});

describe('fetching an import', () => {
  it('refuses until access is allowed, then answers every reader', async () => {
    const before = await ask(TABLE);
    expect(before.status).toBe(403);
    expect(await before.json()).toEqual({ error: 'imports_not_allowed' });
    await allow();
    const res = await ask(TABLE, { owner: 'v', code: 'VIEW' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: [['1', 'x']] });
  });

  it('answers the refusal where the deployment does not fetch', async () => {
    delete env().SHEET_IMPORTS;
    await allow();
    expect(await (await ask(TABLE)).json()).toEqual({ error: '#N/A', why: IMPORT_WORDS.serverOff });
    expect(pageFetches).toBe(0);
  });

  it('refuses a stranger, a document no spreadsheet, and a request that is no import', async () => {
    expect((await ask(TABLE, { owner: 'stranger' })).status).toBe(403);
    await kit.call({ path: '', body: kit.document('plan1', false) });
    const plan = await kit.call({
      method: 'GET',
      path: `/plan1/workbook/imports?${importParams(TABLE).toString()}`,
    });
    expect(plan.status).toBe(404);
    await allow();
    const bad = await kit.call({
      method: 'GET',
      path: '/book1/workbook/imports?kind=zip&url=https://a.example/',
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'import_invalid' });
  });

  it('keeps an answer an hour for everyone, and fetches afresh when asked', async () => {
    stubCache();
    await allow();
    await ask(TABLE);
    await ask(TABLE, { owner: 'v', code: 'VIEW' });
    expect(pageFetches).toBe(1);
    expect(await (await ask(TABLE, { fresh: true })).json()).toEqual({ rows: [['1', 'x']] });
    expect(pageFetches).toBe(2);
  });

  it('answers the cell’s error for a page not fetched or not holding the table', async () => {
    await allow();
    const missing = { ...TABLE, url: 'https://a.example/gone' };
    expect(await (await ask(missing)).json()).toEqual({
      error: '#N/A',
      why: IMPORT_WORDS.notFetched(missing.url),
    });
    expect(await (await ask({ ...TABLE, index: 2 })).json()).toEqual({
      error: '#N/A',
      why: IMPORT_WORDS.empty,
    });
  });

  it('holds each spreadsheet to its rate', async () => {
    await allow();
    const keys: string[] = [];
    env().SHEET_IMPORT_RATE_LIMITER = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: keys.length < 2 };
      },
    };
    expect((await ask(TABLE)).status).toBe(200);
    expect((await ask(TABLE)).status).toBe(429);
    expect(keys).toEqual(['sheet-import:book1', 'sheet-import:book1']);
  });
});

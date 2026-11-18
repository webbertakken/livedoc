// A spreadsheet (or a Plan document) made through the document routes on a real SQLite, for tests of what the room
// stores for its sheets. Not a `.test.ts` file, so vitest doesn't collect it as a suite.
import type { SheetJson, SheetWrite } from '@livedoc/sheets';
import { emptyLayout, WorkbookRecord } from '@livedoc/sheets';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { makeTestRouteContext } from './test-route-context';
import { handleDocuments } from './documents';

export type WorkbookKit = {
  sql: SqliteD1;
  layout: ReturnType<typeof emptyLayout>;
  call: (req: { method?: string; path: string; body?: unknown }) => Promise<Response>;
  /** A document `id` with one sheet tab and its sheet `<id>Sheet`, a spreadsheet unless `spreadsheet` is false. */
  document: (
    id: string,
    spreadsheet: boolean,
    cells?: SheetJson['cells'],
  ) => Record<string, unknown>;
  write: (id: string, w: SheetWrite) => Promise<Response>;
  sheets: (id: string) => Promise<SheetJson[]>;
};

export function workbookKit(): WorkbookKit {
  let n = 7;
  const rand = () => (n = (n * 16807 + 11) % 2147483647) / 2147483647;
  const layout = emptyLayout(rand, 10, 4);
  const sql = sqliteD1();
  (sql.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
    idFromName: (x: string) => x,
    get: () => ({ fetch: async () => new Response(null, { status: 204 }) }),
  };
  sql.sql.exec(
    "INSERT INTO participants (id, name, color, created_at) VALUES ('owner', 'Webber', '#3b82f6', 1);",
  );

  async function call({
    method = 'POST',
    path,
    body,
  }: {
    method?: string;
    path: string;
    body?: unknown;
  }) {
    const pending: Promise<unknown>[] = [];
    const ctx = makeTestRouteContext(method, `/api/documents${path}`, {
      env: sql.env,
      owner: 'owner',
      ...(body === undefined ? {} : { body }),
      waitUntil: (p) => void pending.push(p),
    });
    const res = await handleDocuments(ctx);
    await Promise.all(pending);
    return res;
  }

  return {
    sql,
    layout,
    call,
    document: (id, spreadsheet, cells = []) => ({
      id,
      name: 'Budget',
      tabs: [{ id: `${id}t`, name: 'Sheet1', kind: 'sheet', elements: [] }],
      sheets: [{ id: `${id}Sheet`, tabId: `${id}t`, title: 'Sheet1', layout, cells }],
      ...(spreadsheet
        ? { workbook: WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/London' }) }
        : {}),
    }),
    write: (id, w) => call({ path: `/${id}/sheets/${id}Sheet/writes`, body: { write: w } }),
    sheets: async (id) => {
      const res = await call({ method: 'GET', path: `/${id}/sheets?all=1` });
      return (await res.json<{ sheets: SheetJson[] }>()).sheets;
    },
  };
}

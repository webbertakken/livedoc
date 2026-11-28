// A sheet of a spreadsheet read by another document (docs/specs/029-sheets/plan-links.md "Reading a sheet from another
// document", D505): its values worked out here with the reader's own access, its sheets and version; unchanged when
// asked with the version held; refused alike for no spreadsheet and no access, and past the workbook's bound.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbookLinkResponse } from '@livedoc/api-schema';
import type { SheetJson } from '@livedoc/sheets';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';
import { RANGE_SOURCE_CELLS_MAX } from './sheet-range-read';

let kit: WorkbookKit;

function cellsAt(cells: Record<string, SheetJson['cells'][number]['i']>) {
  const at = (a1: string) => ({
    r: kit.layout.rows[Number(a1.slice(1)) - 1]!,
    c: kit.layout.cols[a1.charCodeAt(0) - 65]!,
  });
  return Object.entries(cells).map(([a1, i]) => ({ ...at(a1), i }));
}

const link = (id: string, query: string, extra: { owner?: string; code?: string } = {}) =>
  kit.call({ method: 'GET', path: `/${id}/workbook/link${query}`, ...extra });

beforeEach(async () => {
  kit = workbookKit();
  // B1 doubles B2, its stored formula naming B2 by ids as the room keeps it.
  const b2 = { r1: kit.layout.rows[1]!, c1: kit.layout.cols[1]! };
  const cells = cellsAt({ A1: { s: 'Total' }, B1: { f: { t: '2*@0', r: [b2] } }, B2: { n: 21 } });
  expect((await kit.call({ path: '', body: kit.document('book1', true, cells) })).status).toBe(201);
  expect((await kit.call({ path: '', body: kit.document('plan1', false) })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('VIEW', 'book1', 'view', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'book1', 'view', 'book1t', 1);",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reading a sheet of a spreadsheet from another document', () => {
  it('answers the sheet as its values, the workbook’s sheets, locale and version', async () => {
    const info = vi.spyOn(console, 'info');
    const res = await link('book1', '?sheet=book1Sheet');
    expect(res.status).toBe(200);
    const body = await res.json<WorkbookLinkResponse>();
    if ('unchanged' in body) throw new Error('read afresh');
    expect(body.locale).toBe('en-GB');
    expect(body.name).toBe('Budget');
    expect(body.sheets).toEqual([{ id: 'book1Sheet', title: 'Sheet1' }]);
    expect(body.version).toMatch(/^[0-9a-f]{16}$/);
    const b1 = body.sheet!.cells.find(
      (c) => c.r === kit.layout.rows[0] && c.c === kit.layout.cols[1],
    );
    expect(b1?.i).toEqual({ n: 42 });
    expect(info).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[workbook\] link read document=book1 sheet=book1Sheet cells=3 ms=\d+$/,
      ),
    );
  });

  it('answers only the sheets with no sheet named, or one it does not hold', async () => {
    for (const query of ['', '?sheet=nosuch']) {
      const body = await (await link('book1', query)).json<WorkbookLinkResponse>();
      expect(body).toMatchObject({ sheets: [{ id: 'book1Sheet' }], sheet: null });
    }
  });

  it('answers unchanged for the version the reader holds, and afresh once the workbook moves on', async () => {
    const first = await (await link('book1', '?sheet=book1Sheet')).json<WorkbookLinkResponse>();
    const kept = await (
      await link('book1', `?sheet=book1Sheet&since=${first.version}`)
    ).json<WorkbookLinkResponse>();
    expect(kept).toEqual({ unchanged: true, version: first.version });
    const [b2] = cellsAt({ B2: { n: 5 } });
    expect((await kit.write('book1', { kind: 'cells', cells: [b2!] })).status).toBe(200);
    const fresh = await (
      await link('book1', `?sheet=book1Sheet&since=${first.version}`)
    ).json<WorkbookLinkResponse>();
    if ('unchanged' in fresh) throw new Error('read afresh');
    expect(fresh.version).not.toBe(first.version);
    expect(
      fresh.sheet!.cells.find((c) => c.r === kit.layout.rows[0] && c.c === kit.layout.cols[1])?.i,
    ).toEqual({ n: 10 });
  });

  it('reads with the reader’s own access: a share link’s holder may, a stranger and a tab-scoped link may not', async () => {
    const info = vi.spyOn(console, 'info');
    expect((await link('book1', '?sheet=book1Sheet', { owner: 'v', code: 'VIEW' })).status).toBe(
      200,
    );
    expect((await link('book1', '?sheet=book1Sheet', { owner: 'stranger' })).status).toBe(404);
    expect((await link('book1', '?sheet=book1Sheet', { owner: 't', code: 'TAB1' })).status).toBe(
      404,
    );
    expect(info).toHaveBeenCalledWith('[workbook] link refused document=book1 reason=permission');
  });

  it('refuses a document that is no spreadsheet as it refuses one the reader may not open', async () => {
    const info = vi.spyOn(console, 'info');
    const res = await link('plan1', '?sheet=plan1Sheet');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'workbook_not_found' });
    expect(info).toHaveBeenCalledWith(
      '[workbook] link refused document=plan1 reason=not_a_spreadsheet',
    );
  });

  it('refuses a workbook past the cells a read works out', async () => {
    const info = vi.spyOn(console, 'info');
    kit.sql.sql.exec(
      `UPDATE sheets SET cell_count = ${RANGE_SOURCE_CELLS_MAX + 1} WHERE document_id = 'book1'`,
    );
    const res = await link('book1', '?sheet=book1Sheet');
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'link_too_large' });
    expect(info).toHaveBeenCalledWith('[workbook] link refused document=book1 reason=too_large');
  });

  it('is read only', async () => {
    expect(
      (await kit.call({ method: 'POST', path: '/book1/workbook/link', body: {} })).status,
    ).toBe(405);
  });
});

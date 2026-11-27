// docs/specs/029-sheets/data-tools.md "Protected ranges" (D346 to D348): the room refuses every write a protection does
// not admit, whatever door it comes through: the write route, a raw changeset, a rename, a deletion; a warning never
// stops an agent; a duplicate leaves its protections behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbookSheetAddResponse } from '@livedoc/api-schema';
import type { Protection, SheetWrite } from '@livedoc/sheets';
import { workbookKit, type KitCall, type WorkbookKit } from './workbook-test-kit';

let kit: WorkbookKit;
const R = (i: number) => kit.layout.rows[i]!;
const C = (i: number) => kit.layout.cols[i]!;
const EDITOR: Partial<KitCall> = { owner: 'e', code: 'EDIT' };
const PARTICIPANT: Partial<KitCall> = { owner: 'p', code: 'PART' };

const set = (r: number, c: number, n: number): SheetWrite => ({
  kind: 'cells',
  cells: [{ r: R(r), c: C(c), i: { n } }],
});
const write = (w: SheetWrite, as: Partial<KitCall> = {}) =>
  kit.call({ path: '/book1/sheets/book1Sheet/writes', body: { write: w }, ...as });
const changeset = (writes: SheetWrite[], as: Partial<KitCall> = {}) =>
  kit.call({ path: '/book1/sheets/book1Sheet/changesets', body: { writes }, ...as });
// A1:B3 by place.
const guard = (can: Protection['can'], range = true): Protection => ({
  id: 'prot01',
  ...(range ? { range: { r1: R(0), c1: C(0), r2: R(2), c2: C(1) } } : {}),
  can,
});
const protect = async (p: Protection) => {
  const res = await write({
    kind: 'layout',
    changes: [{ k: 'protection', id: p.id, protection: p }],
  });
  expect(res.status, await res.clone().text()).toBe(200);
};
const inputAt = async (r: number, c: number) =>
  (await kit.sheets('book1'))[0]!.cells.find((x) => x.r === R(r) && x.c === C(c))?.i;

beforeEach(async () => {
  kit = workbookKit();
  expect((await kit.call({ path: '', body: kit.document('book1', true) })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'book1', 'edit', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, level, tab_id, created_at) VALUES ('PART', 'book1', 'view', 'participate', NULL, 1);",
  );
});

afterEach(() => vi.restoreAllMocks());

describe('a protected range through the write route', () => {
  it('lets Editors write under Editors Only, and refuses a Participant there, saying why', async () => {
    await protect(guard('editors'));
    expect((await write(set(1, 1, 5), EDITOR)).status).toBe(200);
    const refused = await write(set(1, 0, 6), PARTICIPANT);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({
      error: 'protected',
      at: 'prot01',
      line: 'This range is protected: only Editors can change it.',
    });
    expect(await inputAt(1, 0)).toBeUndefined();
    expect((await write(set(5, 3, 7), PARTICIPANT)).status).toBe(200);
  });

  it('lets only the owner write under Only the Owner, and keeps an Editor from rows inside it and the protection', async () => {
    await protect(guard('owner'));
    expect((await write(set(0, 0, 1), EDITOR)).status).toBe(403);
    expect((await write(set(0, 0, 1))).status).toBe(200);
    const inside: SheetWrite = {
      kind: 'layout',
      changes: [{ k: 'insertRows', after: R(0), ids: ['newrow01'] }],
    };
    expect((await write(inside, EDITOR)).status).toBe(403);
    const removed: SheetWrite = {
      kind: 'layout',
      changes: [{ k: 'protection', id: 'prot01', protection: null }],
    };
    expect((await write(removed, EDITOR)).status).toBe(403);
    expect((await write(removed)).status).toBe(200);
    expect((await write(set(0, 0, 2), EDITOR)).status).toBe(200);
  });
});

describe('a protected range through a raw changeset', () => {
  it('refuses the whole changeset at the write it does not admit, storing nothing', async () => {
    await protect(guard('editors'));
    const res = await changeset([set(5, 3, 1), set(2, 1, 2)], PARTICIPANT);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'protected',
      index: 1,
      at: 'prot01',
      line: 'This range is protected: only Editors can change it.',
    });
    expect(await inputAt(5, 3)).toBeUndefined();
  });

  it('never asks an agent a warning: the changeset lands and the room logs it', async () => {
    await protect(guard('warn'));
    const info = vi.spyOn(console, 'info');
    expect((await changeset([set(2, 1, 2)], PARTICIPANT)).status).toBe(200);
    expect(info).toHaveBeenCalledWith('[sheets] protection.warned', {
      documentId: 'book1',
      sheetId: 'book1Sheet',
      protections: ['prot01'],
    });
    expect(await inputAt(2, 1)).toEqual({ n: 2 });
  });
});

describe('a protected sheet', () => {
  const addSheet = async () =>
    (
      await (
        await kit.call({ path: '/book1/workbook/sheets', body: {} })
      ).json<WorkbookSheetAddResponse>()
    ).sheet;

  it('keeps an Editor from renaming it, by either door, and from deleting it, by either door', async () => {
    await protect(guard('owner', false));
    await addSheet();
    const rename = await kit.call({
      path: '/book1/workbook/sheets/book1Sheet/rename',
      body: { name: 'Mine' },
      ...EDITOR,
    });
    expect(rename.status).toBe(403);
    const tabRename = await kit.call({
      method: 'PUT',
      path: '/book1/tabs/book1t/name',
      body: { name: 'Mine' },
      ...EDITOR,
    });
    expect(tabRename.status).toBe(403);
    expect(
      (await kit.call({ method: 'DELETE', path: '/book1/workbook/sheets/book1Sheet', ...EDITOR }))
        .status,
    ).toBe(403);
    expect(
      (await kit.call({ method: 'DELETE', path: '/book1/tabs/book1t', ...EDITOR })).status,
    ).toBe(403);
    expect(
      (await kit.call({ method: 'DELETE', path: '/book1/workbook/sheets/book1Sheet' })).status,
    ).toBe(204);
  });

  it('leaves its protections behind when duplicated', async () => {
    await protect(guard('owner', false));
    const res = await kit.call({ path: '/book1/workbook/sheets', body: { copyOf: 'book1Sheet' } });
    const { sheet } = await res.json<WorkbookSheetAddResponse>();
    expect(sheet.layout.protections).toBeUndefined();
  });
});

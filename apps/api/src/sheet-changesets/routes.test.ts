// A sheet's changesets through the routes on a real SQLite (docs/specs/024-agents/agent-changesets.md "A sheet's
// changesets", D262-D270): atomic, recorded, relayed in order, listed and shown with the document's changesets, and
// reverted keeping what changed since.
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ChangesetSummary,
  SheetChangesetResponse,
  SheetRevertResponse,
} from '@livedoc/api-schema';
import type { SheetJson, SheetWrite } from '@livedoc/sheets';
import { workbookKit, type KitCall, type WorkbookKit } from '../routes/workbook-test-kit';
import { maintainRoom } from '../document-room/room-upkeep';

let kit: WorkbookKit;
const R = (i: number) => kit.layout.rows[i]!;
const C = (i: number) => kit.layout.cols[i]!;

const set = (r: number, c: number, i: unknown): SheetWrite => ({
  kind: 'cells',
  cells: [{ r: R(r), c: C(c), i: i as never }],
});

const submit = (body: unknown, extra: Partial<KitCall> = {}) =>
  kit.call({ path: '/book1/sheets/book1Sheet/changesets', body, ...extra });

const sheet = async (): Promise<SheetJson> => (await kit.sheets('book1'))[0]!;
const input = (s: SheetJson, r: number, c: number) =>
  s.cells.find((x) => x.r === R(r) && x.c === C(c))?.i;

beforeEach(async () => {
  kit = workbookKit();
  expect((await kit.call({ path: '', body: kit.document('book1', true) })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, level, tab_id, created_at) VALUES ('PART', 'book1', 'view', 'participate', NULL, 1);",
  );
  kit.relayed.length = 0;
});

describe('submitting a sheet changeset', () => {
  it('stores every write in one batch, advancing the revision by each, and relays them in order', async () => {
    const res = await submit({
      writes: [set(0, 0, { n: 2 }), set(0, 1, { s: 'two' })],
      summary: 'two cells',
    });
    expect(res.status).toBe(200);
    const body = await res.json<SheetChangesetResponse>();
    expect(body.changeset).toMatchObject({
      sheetId: 'book1Sheet',
      tabId: 'book1t',
      rev: 2,
      previousRev: 0,
      counts: { added: 2, changed: 0, removed: 0 },
    });
    expect(body.changeset!.id).toMatch(/^sc_/);
    expect(body.applied).toHaveLength(2);
    expect(kit.relayed.map((op) => (op as { rev: number }).rev)).toEqual([1, 2]);
    const s = await sheet();
    expect(s.rev).toBe(2);
    expect(input(s, 0, 0)).toEqual({ n: 2 });
    expect(input(s, 0, 1)).toEqual({ s: 'two' });
  });

  it('writes nothing when one write is refused, naming it', async () => {
    const res = await submit({
      writes: [set(0, 0, { n: 1 }), { kind: 'layout', changes: [{ k: 'nope' }] }],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'write_invalid', index: 1 });
    const s = await sheet();
    expect(s.rev).toBe(0);
    expect(input(s, 0, 0)).toBeUndefined();
    expect(kit.relayed).toEqual([]);
  });

  it('answers no changeset for writes that change nothing', async () => {
    const res = await submit({ writes: [set(0, 0, null)] });
    expect(await res.json()).toEqual({ changeset: null, rev: 0, applied: [] });
  });

  it('refuses a stale strict changeset, and a base it cannot have read', async () => {
    await submit({ writes: [set(0, 0, { n: 1 })] });
    expect((await submit({ writes: [set(0, 0, { n: 2 })], rev: 0, strict: true })).status).toBe(
      412,
    );
    expect((await submit({ writes: [set(0, 0, { n: 2 })], rev: 9 })).status).toBe(400);
    expect((await submit({ writes: [set(0, 0, { n: 2 })], strict: true })).status).toBe(400);
    expect((await submit({ writes: [set(0, 0, { n: 2 })], rev: 0 })).status).toBe(200);
  });

  it('renames a spreadsheet sheet and its tab, refusing a name another sheet has', async () => {
    const res = await submit({ writes: [{ kind: 'title', title: ' Costs ' }] });
    expect(res.status).toBe(200);
    expect((await sheet()).title).toBe('Costs');
    const doc = await (
      await kit.call({ method: 'GET', path: '/book1' })
    ).json<{
      document: { tabs: { name: string }[] };
    }>();
    expect(doc.document.tabs[0]!.name).toBe('Costs');
    expect((await submit({ writes: [{ kind: 'title', title: '' }] })).status).toBe(400);
  });

  it('refuses a sheet the document does not hold', async () => {
    const res = await kit.call({
      path: '/book1/sheets/nosuchsheet/changesets',
      body: { writes: [set(0, 0, { n: 1 })] },
    });
    expect(res.status).toBe(404);
  });

  it('refuses a body that is not a list of writes', async () => {
    expect((await submit({ writes: [] })).status).toBe(400);
    expect((await submit({ writes: [{ kind: 'nope' }] })).status).toBe(400);
  });

  it('lets a Participant write values only', async () => {
    const part = { owner: 'p', code: 'PART' };
    const values = await submit(
      { writes: [{ kind: 'cells', cells: [{ r: R(0), c: C(0), i: { n: 3 }, f: { b: true } }] }] },
      part,
    );
    expect(values.status).toBe(200);
    const s = await sheet();
    expect(s.cells.find((x) => x.r === R(0))).toEqual({ r: R(0), c: C(0), i: { n: 3 } });
    const shape = await submit(
      { writes: [{ kind: 'layout', changes: [{ k: 'freeze', rows: 1 }] }] },
      part,
    );
    expect(shape.status).toBe(403);
    const formats = await submit(
      { writes: [{ kind: 'cells', cells: [{ r: R(0), c: C(0), f: { b: true } }] }] },
      part,
    );
    expect(formats.status).toBe(403);
  });

  it('shrinks other sheets reading rows it deletes', async () => {
    const res = await submit({
      writes: [
        set(0, 0, { n: 1 }),
        set(1, 0, { n: 2 }),
        { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(1)] }] },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json<SheetChangesetResponse>();
    expect(body.changeset!.counts).toEqual({ added: 1, changed: 0, removed: 0 });
    expect((await sheet()).layout.rows).not.toContain(R(1));
  });
});

describe('a sheet changeset in the history', () => {
  it('is listed with the document changesets, newest first, and shown', async () => {
    const first = await (
      await submit({ writes: [set(0, 0, { n: 1 })], summary: 'one' })
    ).json<SheetChangesetResponse>();
    const list = await (
      await kit.call({ method: 'GET', path: '/book1/changesets?limit=5' })
    ).json<{ changesets: ChangesetSummary[] }>();
    expect(list.changesets).toEqual([
      expect.objectContaining({ id: first.changeset!.id, sheetId: 'book1Sheet', summary: 'one' }),
    ]);
    const one = await kit.call({ method: 'GET', path: `/book1/changesets/${first.changeset!.id}` });
    expect(await one.json()).toMatchObject({
      changeset: { id: first.changeset!.id },
      text: '1 cells added, 0 changed, 0 removed',
    });
    expect(
      (await kit.call({ method: 'GET', path: '/book1/changesets/sc_0000000000' })).status,
    ).toBe(404);
  });
});

describe('reverting a sheet changeset', () => {
  const revert = (id: string, extra: Partial<KitCall> = {}) =>
    kit.call({ path: `/book1/changesets/${id}/revert`, ...extra });

  it('puts back what nobody changed since, and keeps what they did', async () => {
    await submit({ writes: [set(0, 0, { n: 1 })] });
    const agent = await (
      await submit({ writes: [set(0, 0, { n: 2 }), set(1, 1, { s: 'x' })] })
    ).json<SheetChangesetResponse>();
    await kit.write('book1', set(1, 1, { s: 'mine' }));
    const res = await revert(agent.changeset!.id);
    expect(res.status).toBe(200);
    const body = await res.json<SheetRevertResponse>();
    expect(body.kept).toEqual([{ id: `${R(1)}:${C(1)}`, reason: 'changed' }]);
    expect(body.reverted).toBe(1);
    expect(body.changeset?.id).toMatch(/^sc_/);
    const s = await sheet();
    expect(input(s, 0, 0)).toEqual({ n: 1 });
    expect(input(s, 1, 1)).toEqual({ s: 'mine' });
    const again = await (await revert(agent.changeset!.id)).json<SheetRevertResponse>();
    expect(again.changeset).toBeNull();
  });

  it('deletes rows it inserted only when nobody typed in them since', async () => {
    const agent = await (
      await submit({
        writes: [
          {
            kind: 'layout',
            changes: [{ k: 'insertRows', after: R(0), ids: ['newrow1', 'newrow2'] }],
          },
        ],
      })
    ).json<SheetChangesetResponse>();
    await kit.write('book1', { kind: 'cells', cells: [{ r: 'newrow2', c: C(0), i: { n: 5 } }] });
    const body = await (await revert(agent.changeset!.id)).json<SheetRevertResponse>();
    expect(body.kept).toEqual([{ id: 'row:newrow2', reason: 'changed' }]);
    const rows = (await sheet()).layout.rows;
    expect(rows).toContain('newrow2');
    expect(rows).not.toContain('newrow1');
  });

  it('is an Editor’s', async () => {
    const agent = await (
      await submit({ writes: [set(0, 0, { n: 2 })] })
    ).json<SheetChangesetResponse>();
    expect((await revert(agent.changeset!.id, { owner: 'p', code: 'PART' })).status).toBe(403);
  });
});

describe('the room upkeep', () => {
  it('deletes sheet changesets past their retention', async () => {
    await submit({ writes: [set(0, 0, { n: 2 })] });
    const out = await maintainRoom(kit.sql.env, 'book1', Date.now() + 40 * 86_400_000);
    expect(out.changesets).toBe(1);
    const left = await kit.sql.env.DOCUMENT_DB.prepare(
      'SELECT COUNT(*) AS n FROM sheet_changeset_parts',
    ).first<{ n: number }>();
    expect(left).toEqual({ n: 0 });
  });
});

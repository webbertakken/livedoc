import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NETWORK_T0,
  ownerIdentity,
  roomNetwork,
  tabSeed,
  type RoomNetwork,
} from '../test-room-network';

// POST /api/documents/:id/tabs/:tabId/link with { from } (docs/specs/006-document/tab-document-many-to-many.md
// "API impact"): 400 without `from` or with `from` the target, 403 unless the caller owns both, 404 for a missing
// `from` or tab, 409 `tab_id_taken` for an unrelated tab of that id, 200 with the tab as the target holds it.

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NETWORK_T0);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function network(): Promise<RoomNetwork> {
  const net = roomNetwork(['A', 'B', 'Z']);
  net.d1.sql.exec("UPDATE documents SET owner_id = 'other' WHERE id = 'Z'");
  await net.room('A').room.create('A', tabSeed([{ id: 't', name: 'Glossary' }]));
  await net.room('B').room.create('B', tabSeed([{ id: 'b1' }]));
  await net.room('Z').room.create('Z', tabSeed([{ id: 'z' }]));
  return net;
}

function link(net: RoomNetwork, body: unknown, opts: { tab?: string; owner?: string } = {}) {
  const request = new Request(`https://api.test/api/documents/B/tabs/${opts.tab ?? 't'}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return net.room('B').room.route('B', request, ownerIdentity(opts.owner));
}

const tabIds = (net: RoomNetwork, id: string) =>
  (
    net.room(id).sql.prepare('SELECT tab_id FROM document_tabs ORDER BY order_index').all() as {
      tab_id: string;
    }[]
  ).map((r) => r.tab_id);

const SETTINGS =
  '{"locale":"en-GB","timeZone":"UTC","recalc":"change","iterate":{"on":false,"max":50,"threshold":0.05}}';
const makeSpreadsheet = (net: RoomNetwork, id: string) =>
  net
    .room(id)
    .sql.exec(
      `INSERT INTO workbook (document_id, format, settings, created_at, updated_at) VALUES ('${id}', 'ods', '${SETTINGS}', 1, 1)`,
    );

describe('POST /api/documents/:id/tabs/:tabId/link', () => {
  // docs/specs/029-sheets/spreadsheet.md "The workbook shape": a spreadsheet's sheets live in its own room.
  it('never shares a spreadsheet’s tab into another document', async () => {
    const net = await network();
    makeSpreadsheet(net, 'A');
    const res = await link(net, { from: 'A' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'tab_not_linkable' });
    expect(tabIds(net, 'B')).toEqual(['b1']);
  });

  it('never shares a tab into a spreadsheet', async () => {
    const net = await network();
    makeSpreadsheet(net, 'B');
    expect((await link(net, { from: 'A' })).status).toBe(409);
    expect(tabIds(net, 'B')).toEqual(['b1']);
  });

  it('adds the tab at the end of the order and answers it', async () => {
    const net = await network();
    const res = await link(net, { from: 'A' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tab: { id: 't', name: 'Glossary' } });
    expect(tabIds(net, 'B')).toEqual(['b1', 't']);
  });

  it('answers a repeat with the tab as held, adding nothing', async () => {
    const net = await network();
    await link(net, { from: 'A' });
    const res = await link(net, { from: 'A' });
    expect(res.status).toBe(200);
    expect(tabIds(net, 'B')).toEqual(['b1', 't']);
  });

  it('refuses without `from`, or with the target as `from`', async () => {
    const net = await network();
    expect((await link(net, {})).status).toBe(400);
    expect((await link(net, { from: 'B' })).status).toBe(400);
  });

  it('refuses a caller who does not own the target, or `from`', async () => {
    const net = await network();
    expect((await link(net, { from: 'A' }, { owner: 'stranger' })).status).toBe(403);
    expect((await link(net, { from: 'Z' }, { tab: 'z' })).status).toBe(403);
    expect(tabIds(net, 'B')).toEqual(['b1']);
  });

  it('answers 404 for a missing `from` or a tab `from` does not hold', async () => {
    const net = await network();
    expect((await link(net, { from: 'nowhere' })).status).toBe(404);
    expect((await link(net, { from: 'A' }, { tab: 'missing' })).status).toBe(404);
  });

  it('refuses a target already holding an unrelated tab of that id', async () => {
    const net = await network();
    const res = await link(net, { from: 'A' }, { tab: 'b1' });
    expect(res.status).toBe(404);
    // A holds a tab of its own that happens to share the id.
    net.room('A').sql
      .exec(`INSERT INTO tabs (id, name, data, updated_at) VALUES ('b1', 'Other', '{"elements":[]}', 1);
      INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('A', 'b1', 9, 1);`);
    const taken = await link(net, { from: 'A' }, { tab: 'b1' });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'tab_id_taken' });
    expect(warn).toHaveBeenCalledWith('[tab-link] refused', {
      documentId: 'B',
      tabId: 'b1',
      from: 'A',
      reason: 'tab_id_taken',
    });
  });

  it('links from a document in its Trash', async () => {
    const net = await network();
    net.d1.sql.exec(`UPDATE documents SET trashed_at = ${NETWORK_T0} WHERE id = 'A'`);
    expect((await link(net, { from: 'A' })).status).toBe(200);
  });

  it('keeps the tab when the join is not recorded, and sends it back to teach `from`', async () => {
    const net = await network();
    net.offline.add('A.shareJoined');
    const res = await link(net, { from: 'A' });
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith('[tab-link] join not recorded', {
      documentId: 'B',
      tabId: 't',
      from: 'A',
      error: expect.stringContaining('unreachable'),
    });
    const owed = net.room('B').sql.prepare('SELECT kind, to_document FROM share_outbox').all();
    expect(owed).toEqual([{ kind: 'body', to_document: 'A' }]);
    net.offline.clear();
    vi.setSystemTime(NETWORK_T0 + 5_000);
    await net.room('B').room.alarm();
    const holders = net.room('A').sql.prepare('SELECT document_id FROM tab_shares').all();
    expect(holders).toEqual([{ document_id: 'B' }]);
  });
});

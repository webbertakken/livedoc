import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetThreadResponse, SheetThreadsResponse } from '@livedoc/api-schema';
import { adderKeyFor } from '../adder-key';
import { sheetThreadCollab } from '../document-room/sheet-thread-collab';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';
import * as stored from '../db/sheet-threads';

vi.mock('../db/sheet-threads', async (original) => {
  const real = await original<typeof import('../db/sheet-threads')>();
  return { ...real, storeThread: vi.fn(real.storeThread) };
});

// docs/specs/029-sheets/review.md "Comments": a spreadsheet's threads, kept in the sheet store, one op a write, its
// author the caller, a Participant's own comments alone, a Viewer none, relayed whole, in the Inbox's rows.

let kit: WorkbookKit;
const SHEET = 'book1Sheet';

const post = (op: unknown, who: { owner?: string; code?: string } = {}) =>
  kit.call({ path: `/book1/sheets/${SHEET}/threads`, body: { op }, ...who });
const list = (who: { owner?: string; code?: string } = {}) =>
  kit.call({ method: 'GET', path: '/book1/sheet-threads', ...who });

const anchor = () => {
  const { rows, cols } = kit.layout;
  return { r1: rows[1]!, c1: cols[1]!, r2: rows[2]!, c2: cols[2]! };
};
const start = (who: { owner?: string; code?: string } = {}, id = 't1') =>
  post({ op: 'start', id, comment: `${id}c`, anchor: anchor(), text: 'Is this right?' }, who);

beforeEach(async () => {
  kit = workbookKit();
  expect((await kit.call({ path: '', body: kit.document('book1', true) })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, level, tab_id, created_at) VALUES ('PART', 'book1', 'view', 'participate', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('VIEW', 'book1', 'view', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'book1', 'edit', NULL, 1);" +
      "INSERT INTO participants (id, name, color, created_at) VALUES ('p', 'Pat', '#10b981', 1);",
  );
  kit.relayed.length = 0;
});

describe('starting and reading threads', () => {
  it('starts a thread by the caller, stores it and relays its whole state', async () => {
    const res = await start();
    expect(res.status).toBe(200);
    const { thread } = await res.json<SheetThreadResponse>();
    expect(thread).toMatchObject({
      id: 't1',
      sheetId: SHEET,
      anchor: anchor(),
      resolved: false,
      v: 1,
      comments: [
        {
          id: 't1c',
          text: 'Is this right?',
          author: { key: await adderKeyFor('book1', 'owner'), name: 'Webber', colour: '#3b82f6' },
        },
      ],
    });
    expect(kit.relayed).toEqual([
      { kind: 'sheet-thread', sheetId: SHEET, tabId: 'book1t', id: 't1', thread },
    ]);
    const read = await (await list()).json<SheetThreadsResponse>();
    expect(read.threads).toEqual([thread]);
  });

  it('gives a Viewer no threads, and refuses a Viewer’s op', async () => {
    await start();
    const viewer = await list({ owner: 'v', code: 'VIEW' });
    expect(viewer.status).toBe(200);
    expect(await viewer.json<SheetThreadsResponse>()).toEqual({ threads: [] });
    expect((await start({ owner: 'v', code: 'VIEW' }, 't2')).status).toBe(403);
  });

  it('refuses a malformed op, an anchor off the sheet, and a thread on a Plan Sheet', async () => {
    expect((await post({ op: 'start' })).status).toBe(400);
    const off = await post({
      op: 'start',
      id: 't9',
      comment: 'c',
      anchor: { ...anchor(), r2: 'gone0000' },
      text: 'x',
    });
    expect([off.status, await off.json()]).toEqual([400, { error: 'thread_invalid' }]);
    expect((await kit.call({ path: '', body: kit.document('plan1', false) })).status).toBe(201);
    const plan = await kit.call({
      path: '/plan1/sheets/plan1Sheet/threads',
      body: { op: { op: 'start', id: 't1', comment: 'c', anchor: anchor(), text: 'x' } },
    });
    expect(plan.status).toBe(404);
  });
});

describe('who may', () => {
  it("lets a Participant reply, resolve and react, edit and remove their own, never another's", async () => {
    await start();
    const part = { owner: 'p', code: 'PART' };
    expect((await post({ op: 'reply', thread: 't1', id: 'r1', text: 'Yes' }, part)).status).toBe(
      200,
    );
    expect(
      (await post({ op: 'react', thread: 't1', comment: 't1c', emoji: '👍', on: true }, part))
        .status,
    ).toBe(200);
    expect(
      (await post({ op: 'edit', thread: 't1', comment: 'r1', text: 'Yes, checked' }, part)).status,
    ).toBe(200);
    expect((await post({ op: 'remove', thread: 't1', comment: 't1c' }, part)).status).toBe(403);
    const resolved = await post({ op: 'resolve', thread: 't1', resolved: true }, part);
    const { thread } = await resolved.json<SheetThreadResponse>();
    expect(thread).toMatchObject({ resolved: true, v: 5 });
    expect(thread?.comments.map((c) => [c.id, c.text, c.author.name])).toEqual([
      ['t1c', 'Is this right?', 'Webber'],
      ['r1', 'Yes, checked', 'Pat'],
    ]);
    expect(thread?.comments[0]?.reactions).toEqual({ '👍': [await adderKeyFor('book1', 'p')] });
    expect((await post({ op: 'remove', thread: 't1', comment: 'r1' }, part)).status).toBe(200);
  });

  it("lets an Editor remove anyone's comment, the first taking the thread", async () => {
    await start({ owner: 'p', code: 'PART' });
    const res = await post(
      { op: 'remove', thread: 't1', comment: 't1c' },
      { owner: 'e', code: 'EDIT' },
    );
    expect(await res.json()).toEqual({ id: 't1', thread: null });
    expect((await (await list()).json<SheetThreadsResponse>()).threads).toEqual([]);
    expect(kit.relayed.at(-1)).toMatchObject({ kind: 'sheet-thread', id: 't1', thread: null });
  });

  it('tries again when another op lands first, then says the sheet is busy', async () => {
    await start();
    vi.mocked(stored.storeThread).mockResolvedValue(false);
    const res = await post({ op: 'resolve', thread: 't1', resolved: true });
    vi.mocked(stored.storeThread).mockReset();
    expect([res.status, await res.json()]).toEqual([409, { error: 'sheet_busy' }]);
  });

  it("confines a tab's link to its tab's threads and sheets", async () => {
    kit.sql.sql.exec(
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'book1', 'edit', 'book1t', 1);",
    );
    await start();
    const added = await kit.call({ path: '/book1/workbook/sheets', body: { sheetId: 'second01' } });
    expect(added.status).toBe(201);
    const scoped = { owner: 's', code: 'TAB1' };
    const read = await kit.call({
      method: 'GET',
      path: '/book1/sheet-threads?tabId=book1t',
      ...scoped,
    });
    expect((await read.json<SheetThreadsResponse>()).threads.map((t) => t.id)).toEqual(['t1']);
    const other = await kit.call({
      path: '/book1/sheets/second01/threads?tabId=book1t',
      body: { op: { op: 'resolve', thread: 't1', resolved: true } },
      ...scoped,
    });
    expect(other.status).toBe(404);
    expect((await list({ owner: 'nobody' })).status).toBe(403);
  });

  it('reads a thread whose stored comments cannot be read as having none', async () => {
    await start();
    kit.sql.sql.exec("UPDATE sheet_threads SET comments = 'not json'");
    const { threads } = await (await list()).json<SheetThreadsResponse>();
    expect(threads[0]?.comments).toEqual([]);
  });

  it('says a thread is gone', async () => {
    const res = await post({ op: 'resolve', thread: 'nope', resolved: true });
    expect([res.status, await res.json()]).toEqual([404, { error: 'thread_gone' }]);
  });
});

describe('the Inbox rows', () => {
  it("labels a tab's threads by sheet and range, their authors as identities", async () => {
    await start();
    await post(
      {
        op: 'reply',
        thread: 't1',
        id: 'r1',
        text: 'Yes +webber',
        assignee: { userId: 'owner', name: 'Webber', handle: 'webber' },
      },
      { owner: 'p', code: 'PART' },
    );
    // Pat opened the share link, so the push knows them (collab-key-owners.ts).
    kit.sql.sql.exec(
      "INSERT INTO shared_with (owner_id, document_id, role, last_seen) VALUES ('p', 'book1', 'view', 2)",
    );
    const { env } = kit.sql;
    const rows = await sheetThreadCollab(env, 'book1', 'book1t', async () => 'team1');
    expect(rows?.actions).toEqual([
      expect.objectContaining({
        elementId: 't1',
        assigneeUserId: 'owner',
        assignerId: 'p',
        teamId: 'team1',
      }),
    ]);
    expect(rows?.threads).toEqual([
      expect.objectContaining({
        elementId: 't1',
        elementLabel: 'Sheet1!B2:C3',
        commentCount: 2,
        participantIds: ['owner', 'p'],
        latestText: 'Yes +webber',
      }),
    ]);
    expect(await sheetThreadCollab(env, 'book1', 'none', async () => null)).toBeNull();
  });
});

// standard-mapping.md "Comments in the file": an opened file's threads stored by an Editor, each comment from the file;
// a download writes the threads for whoever may comment, none for a Viewer (D655).
describe('threads and files', () => {
  const fromFile = (threads: unknown, who: { owner?: string; code?: string } = {}) =>
    kit.call({ path: `/book1/sheets/${SHEET}/file-threads`, body: { threads }, ...who });
  const fileThread = (extra: Record<string, unknown> = {}) => ({
    anchor: anchor(),
    resolved: true,
    comments: [
      {
        text: 'From Excel\u0007',
        at: 5,
        author: 'Jose',
        colour: '#123456',
        edited: 6,
        mentions: [{ userId: null, name: 'Bo', handle: 'bo' }, 'x'],
        assignee: { userId: null, name: 'Bo', handle: 'bo' },
        reactions: { '👍': ['k2', 'k1', 'k1'], '': ['k'], bad: [3] },
      },
      { text: '   ', at: 1, author: 'Blank' },
      { text: 'Reply', at: 'no', author: 'Bad' },
      { text: 'Plain', at: 7, author: 'Kim', colour: 'red' },
    ],
    ...extra,
  });

  it('stores an opened file’s threads, an Editor’s, each comment from the file and bounded', async () => {
    const res = await fromFile([
      fileThread(),
      fileThread({ anchor: { ...anchor(), c2: 'gone0000' } }),
      fileThread({ comments: [{ text: '', at: 1, author: 'x' }] }),
      'nope',
      { anchor: 'x', comments: [] },
      { anchor: anchor(), comments: 'x' },
      { anchor: { r1: 1, c1: 1, r2: 1, c2: 1 }, comments: [] },
    ]);
    expect([res.status, await res.json()]).toEqual([200, { stored: 1 }]);
    const { threads } = await (await list()).json<SheetThreadsResponse>();
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ sheetId: SHEET, anchor: anchor(), resolved: true, v: 1 });
    expect(threads[0]!.comments.map((c) => ({ ...c, id: typeof c.id }))).toEqual([
      {
        id: 'string',
        text: 'From Excel',
        at: 5,
        edited: 6,
        author: { name: 'Jose', colour: '#123456', fromFile: true },
        mentions: [{ userId: null, name: 'Bo', handle: 'bo' }],
        assignee: { userId: null, name: 'Bo', handle: 'bo' },
        reactions: { '👍': ['k1', 'k2'] },
      },
      {
        id: 'string',
        text: 'Plain',
        at: 7,
        author: { name: 'Kim', colour: '#6b7280', fromFile: true },
      },
    ]);
  });

  it('refuses a Participant, a malformed body, a Plan document, and stores none past the sheet’s room', async () => {
    expect((await fromFile([fileThread()], { owner: 'p', code: 'PART' })).status).toBe(403);
    expect((await kit.call({ path: `/book1/sheets/${SHEET}/file-threads`, body: {} })).status).toBe(
      400,
    );
    expect(
      (await kit.call({ path: `/book1/sheets/nope/file-threads`, body: { threads: [] } })).status,
    ).toBe(404);
    const spy = vi
      .spyOn(stored, 'readThreadAt')
      .mockResolvedValueOnce({ thread: null, count: 1000 });
    expect(await (await fromFile([fileThread()])).json()).toEqual({ stored: 0 });
    spy.mockRestore();
    expect(
      (await kit.call({ path: `/book1/sheets/${SHEET}/file-threads`, method: 'GET' })).status,
    ).toBe(405);
  });

  it('writes the threads into a download, none into a Viewer’s', async () => {
    await start();
    const download = async (who: { owner?: string; code?: string } = {}) =>
      new Uint8Array(
        await (
          await kit.call({ method: 'GET', path: '/book1/workbook/file?format=fods', ...who })
        ).arrayBuffer(),
      );
    const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    expect(text(await download())).toContain('livedoc:thread=');
    expect(text(await download())).toContain('<text:p>Is this right?</text:p>');
    expect(text(await download({ owner: 'v', code: 'VIEW' }))).not.toContain('Is this right?');
  });
});

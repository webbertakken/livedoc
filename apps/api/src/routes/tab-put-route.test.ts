import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANGESET_MERGE_WINDOW_MS } from '@livedoc/api-schema';
import { elementFingerprint, type Element, type ElementOp, type Tab } from '@livedoc/document';
import { presetSetup } from '@livedoc/items';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import type { Env } from '../types';
import type { ChangesetRecord } from '../db/changesets';
import { createShareLink } from '../db/share';
import { makeTestRouteContext } from './test-route-context';
import { handleDocuments } from './documents';
import { testDocumentRoom } from '../test-document-room';

// The editor's whole-tab save (docs/specs/024-agents/agent-changesets.md):
// refused to tokens, merged with the changesets the saver had not seen, written at the revision it
// read.

const OWNER = 'user_owner';
const box = (id: string, label = id): Element => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  label,
});

function call(
  db: SqliteD1,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string>; token?: boolean } = {},
) {
  return handleDocuments(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner: OWNER,
      sessionAccountId: opts.token ? null : OWNER,
      verifiedAccountId: OWNER,
      body: opts.body,
      headers: opts.headers,
      token: opts.token ? { id: 'tok_1' } : null,
    }),
  );
}

async function documentWith(elements: Element[], env: Partial<Env> = {}): Promise<SqliteD1> {
  const db = sqliteD1(env);
  const res = await call(db, 'POST', '/api/documents', {
    body: { id: 'D', name: 'Board', tabs: [{ id: 't1', name: 'Board', elements }] },
  });
  expect(res.status).toBe(201);
  return db;
}

const stored = (db: SqliteD1) =>
  (
    JSON.parse(db.sql.prepare("SELECT data FROM tabs WHERE id = 't1'").get()!.data as string) as {
      elements: Element[];
    }
  ).elements;
const revOf = (db: SqliteD1) => db.sql.prepare("SELECT rev FROM tabs WHERE id = 't1'").get()!.rev;

// A changeset recorded as the pipeline records it: the tab advanced to `rev` with `n` added.
// Straight through SQLite, so a test may run it from inside an intercepted D1 batch.
function recordAdd(db: SqliteD1, n: Element, createdAt = Date.now()): number {
  const rev = Number(revOf(db)) + 1;
  const elements = [...stored(db), n];
  db.sql
    .prepare("UPDATE tabs SET data = ?, rev = ? WHERE id = 't1'")
    .run(JSON.stringify({ elements }), rev);
  const record: ChangesetRecord = {
    id: `cs_${String(rev).padStart(10, '0')}`,
    documentId: 'D',
    tabId: 't1',
    rev,
    baseRev: null,
    authorId: OWNER,
    authorName: 'Webber',
    authorColor: '#0ea5e9',
    tokenId: 'tok_1',
    summary: null,
    fingerprints: { before: {}, after: { [n.id]: elementFingerprint(n) } },
    counts: { added: 1, changed: 0, removed: 0 },
    createdTab: false,
    revertOf: null,
    createdAt,
  };
  const ops: ElementOp[] = [{ kind: 'add', element: n, at: elements.length - 1 }];
  db.sql
    .prepare(
      `INSERT INTO agent_changesets (id, document_id, tab_id, rev, author_id, author_name,
         author_color, token_id, fingerprints, added, changed, removed, created_at)
       VALUES (?, 'D', 't1', ?, ?, 'Webber', '#0ea5e9', 'tok_1', ?, 1, 0, 0, ?)`,
    )
    .run(record.id, rev, OWNER, JSON.stringify(record.fingerprints), createdAt);
  db.sql
    .prepare("INSERT INTO agent_changeset_parts (changeset_id, part, data) VALUES (?, 'ops', ?)")
    .run(record.id, JSON.stringify(ops));
  return rev;
}

const save = (
  db: SqliteD1,
  elements: Element[],
  headers: Record<string, string> = {},
  extra = {},
) =>
  call(db, 'PUT', '/api/documents/D/tabs/t1', {
    body: { id: 't1', name: 'Board', elements, ...extra },
    headers,
  });

afterEach(() => vi.restoreAllMocks());

describe('the tab PUT', () => {
  // A malformed element is refused by the schema gate like any other, never thrown on by the migrations that run
  // before it: a step chip's label a number, not text, threw in settleChips and answered 500.
  it('refuses a malformed chip as an invalid tab, not a server error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = await documentWith([box('a')]);
    const step = { ...box('s'), shape: 'step', label: 5 } as unknown as Element;
    const res = await save(db, [box('a'), step]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request', message: 'invalid tab' });
    expect(stored(db).map((e) => e.id)).toEqual(['a']);
  });

  it('refuses an API token with use_changesets, naming the route, before reading anything', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await documentWith([box('a')]);
    const res = await call(db, 'PUT', '/api/documents/D/tabs/t1', {
      body: { id: 't1', name: 'Board', elements: [] },
      token: true,
    });
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({
      error: 'use_changesets',
      message:
        'Agents and scripts write tabs with changesets: POST /api/documents/D/tabs/t1/changesets',
    });
    expect(stored(db).map((e) => e.id)).toEqual(['a']);
    expect(info).toHaveBeenCalledWith('[changeset] whole-tab-refused', {
      documentId: 'D',
      tabId: 't1',
      tokenId: 'tok_1',
    });
  });

  // docs/specs/024-agents/agent-changesets.md: a workbench session is a person's editor, not a token, so its
  // whole-tab save goes through as the owner's own.
  it('saves a workbench session tab as a person editor would', async () => {
    const db = await documentWith([box('a')]);
    const res = await handleDocuments(
      makeTestRouteContext('PUT', '/api/documents/D/tabs/t1', {
        env: db.env,
        owner: OWNER,
        sessionAccountId: null,
        verifiedAccountId: OWNER,
        token: null,
        workbench: { sessionId: 's', ownerId: OWNER, documentId: 'D' } as never,
        body: { id: 't1', name: 'Board', elements: [box('a'), box('b')] },
      }),
    );
    expect(res.status).toBe(200);
    expect(stored(db).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('answers the new revision and strips record fields from the body', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await documentWith([box('a')]);
    const res = await save(
      db,
      [box('a', 'b')],
      {},
      { rev: 99, documentId: 'X', orderIndex: 7, updatedAt: 1 },
    );
    expect(res.status).toBe(200);
    const { tab } = (await res.json()) as {
      tab: { rev: number; documentId: string; orderIndex: number };
    };
    expect(tab).toMatchObject({ rev: 2, documentId: 'D', orderIndex: 0 });
    const data: unknown = JSON.parse(
      db.sql.prepare("SELECT data FROM tabs WHERE id = 't1'").get()!.data as string,
    );
    expect(data).not.toHaveProperty('rev');
    expect(data).not.toHaveProperty('documentId');
  });

  it('merges a changeset the saver had not seen, and logs it', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await documentWith([box('a')]);
    const seen = revOf(db);
    recordAdd(db, box('n'));
    const res = await save(db, [box('a', 'edited')], { 'X-Changeset-Seen': String(seen) });
    expect(res.status).toBe(200);
    expect(stored(db).map((e) => [e.id, (e as { label?: string }).label])).toEqual([
      ['a', 'edited'],
      ['n', 'n'],
    ]);
    expect(info).toHaveBeenCalledWith(
      '[changeset] merged-on-save',
      expect.objectContaining({ documentId: 'D', tabId: 't1', elements: 1 }),
    );
  });

  it('merges nothing the saver has already seen', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await documentWith([box('a')]);
    const rev = recordAdd(db, box('n'));
    await save(db, [box('a')], { 'X-Changeset-Seen': String(rev) });
    expect(stored(db).map((e) => e.id)).toEqual(['a']);
  });

  it('without the header (an older editor), merges the last 10 minutes only', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await documentWith([box('a')]);
    recordAdd(db, box('old'), Date.now() - CHANGESET_MERGE_WINDOW_MS - 1000);
    recordAdd(db, box('recent'));
    await save(db, [box('a')]);
    expect(stored(db).map((e) => e.id)).toEqual(['a', 'recent']);
  });

  it('reads an unparsable header as absent, and logs it', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = await documentWith([box('a')]);
    recordAdd(db, box('recent'));
    await save(db, [box('a')], { 'X-Changeset-Seen': 'soon' });
    expect(stored(db).map((e) => e.id)).toEqual(['a', 'recent']);
    expect(warn).toHaveBeenCalledWith(
      '[changeset] seen-invalid',
      expect.objectContaining({ length: 4 }),
    );
  });

  it('repeats a lost race once, merging what won, then answers tab_busy', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = await documentWith([box('a')]);
    const seen = String(revOf(db));
    // A changeset lands between the save's read and its write, once.
    const batch = db.env.DOCUMENT_DB.batch.bind(db.env.DOCUMENT_DB);
    let interleave = 1;
    db.env.DOCUMENT_DB.batch = async (statements: D1PreparedStatement[]) => {
      if (interleave > 0) {
        interleave -= 1;
        recordAdd(db, box(`raced${interleave}`));
      }
      return batch(statements);
    };
    expect((await save(db, [box('a', 'mine')], { 'X-Changeset-Seen': seen })).status).toBe(200);
    expect(stored(db).map((e) => e.id)).toEqual(['a', 'raced0']);

    interleave = 5;
    expect((await save(db, [box('a')], { 'X-Changeset-Seen': seen })).status).toBe(409);
  });
});

describe('the tab read', () => {
  it('carries the revision in the body and as a weak ETag', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await documentWith([box('a')]);
    await save(db, [box('a', 'b')]);
    const res = await call(db, 'GET', '/api/documents/D/tabs/t1');
    expect(res.headers.get('ETag')).toBe('W/"2"');
    expect((await res.json<{ tab: { rev: number } }>()).tab.rev).toBe(2);
  });
});

// A save upserts by tab id: an id that names another document's tab is refused, never overwritten or adopted.
// A share link makes tab ids visible (its document lists them), so this is what keeps a shared board safe.
describe("another document's tab id", () => {
  // Each document's tabs are its own room's (docs/specs/006-document/offline-mode.md): a save naming another
  // document's tab id makes a tab of the caller's own and cannot reach the other one. Two real rooms, one D1.
  it("saves the caller's own tab, leaving the other document's as it was", async () => {
    const db = sqliteD1();
    db.sql.exec(`INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at)
      VALUES ('D', 'user_victim', 'Theirs', 0, 1, 1), ('E', 'user_attacker', 'Mine', 0, 1, 1)`);
    const identity = (owner: string) => ({
      sessionAccountId: owner,
      verifiedAccountId: owner,
      accountEmail: null,
      sessionAuthTime: null,
      owner,
      token: null,
      workbench: null,
    });
    const victim = testDocumentRoom(db.env);
    const attacker = testDocumentRoom(db.env);
    const seed = (owner: string, tabs: Tab[]) => ({
      identity: identity(owner),
      owner,
      recommit: false,
      savedAt: 1,
      createdAt: 1,
      presentation: null,
      itemTypes: null,
      tabs,
      items: [],
      sheets: [],
    });
    await victim.room.create(
      'D',
      seed('user_victim', [{ id: 'old', name: 'Old', elements: [box('v', 'Original')] }]),
    );
    await attacker.room.create(
      'E',
      seed('user_attacker', [{ id: 'e1', name: 'Mine', elements: [] }]),
    );
    const res = await attacker.room.route(
      'E',
      new Request('https://api.test/api/documents/E/tabs/old', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'old', name: 'Taken', elements: [box('x', 'Overwritten')] }),
      }),
      identity('user_attacker'),
    );
    expect(res.status).toBe(200);
    const labels = (sql: typeof victim.sql) =>
      (
        JSON.parse(sql.prepare("SELECT data FROM tabs WHERE id = 'old'").get()!.data as string) as {
          elements: { label?: string }[];
        }
      ).elements.map((e) => e.label);
    expect(labels(victim.sql)).toEqual(['Original']);
    expect(labels(attacker.sql)).toEqual(['Overwritten']);
  });

  it('still saves a brand new tab, and the owner keeps saving their own', async () => {
    const db = await documentWith([box('a')]);
    const fresh = await call(db, 'PUT', '/api/documents/D/tabs/t2', {
      body: { id: 't2', name: 'Second', elements: [box('b')] },
    });
    expect(fresh.status).toBeLessThan(300);
    const again = await call(db, 'PUT', '/api/documents/D/tabs/t1', {
      body: { id: 't1', name: 'Board', elements: [box('a', 'Edited')] },
    });
    expect(again.status).toBeLessThan(300);
  });
});

describe('comments in a tab PUT', () => {
  // docs/specs/014-identity/auth-and-guest-access.md: a comment's author is the server's word. A writer with no
  // participant row (a guest who never set a name) once had the body stored as sent, so an edit link could put
  // words in someone else's mouth or post under their name.
  const thread = (comments: object[]) =>
    ({ ...box('a'), commentThread: { comments, resolved: false } }) as unknown as Element;
  const bobs = {
    id: 'c1',
    text: 'Ship it',
    createdAt: 1,
    authorName: 'Bob',
    authorColor: '#111111',
    authorId: 'user_bob',
  };

  it("keeps someone else's comment and credits a new one to the writer, with no profile", async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await documentWith([thread([bobs])]);
    const forged = {
      id: 'c2',
      text: 'Delete it all',
      createdAt: 2,
      authorName: 'Alice',
      authorColor: '#222222',
      authorId: 'user_alice',
      tokenId: 'tok_x',
    };
    const res = await save(db, [
      thread([{ ...bobs, text: 'Never ship', authorName: 'Eve' }, forged]),
    ]);
    expect(res.status).toBe(200);
    const comments = (
      stored(db)[0] as unknown as { commentThread: { comments: Record<string, unknown>[] } }
    ).commentThread.comments;
    expect(comments[0]).toMatchObject({ text: 'Ship it', authorName: 'Bob', authorId: 'user_bob' });
    expect(comments[1]).toMatchObject({
      text: 'Delete it all',
      authorId: OWNER,
      authorName: 'Anonymous',
    });
    expect(comments[1]).not.toHaveProperty('tokenId');
  });
});

// docs/specs/026-plan/items.md "Who may do what": a board or plan view shows every card, so a link confined to one
// tab may not add the first one to it; a board already there stays theirs to edit around.
describe('a tab-scoped link and boards', () => {
  const board = {
    id: 'b1',
    type: 'shape',
    shape: 'plan-board',
    x: 0,
    y: 0,
    width: 800,
    height: 400,
    planBoard: presetSetup('kanban'),
  } as unknown as Element;
  const asVisitor = (db: SqliteD1, elements: Element[]) =>
    handleDocuments(
      makeTestRouteContext('PUT', '/api/documents/D/tabs/t1', {
        env: db.env,
        owner: 'v',
        sessionAccountId: 'v',
        verifiedAccountId: 'v',
        token: null,
        headers: { 'X-Share-Code': 'TAB1' },
        body: { id: 't1', name: 'Board', elements },
      }),
    );

  it('refuses the first board from the link, and lets it edit a tab that already has one', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await documentWith([box('a')]);
    db.sql
      .prepare(
        "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'D', 'edit', 't1', 1)",
      )
      .run();
    const refused = await asVisitor(db, [box('a'), board]);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'tab_scope_widen' });
    expect(stored(db).map((e) => e.id)).toEqual(['a']);
    // A plain edit from the link still saves.
    expect((await asVisitor(db, [box('a', 'moved')])).status).toBe(200);
    // The owner adds the board; the link may then save the tab with it.
    expect((await save(db, [box('a', 'moved'), board])).status).toBe(200);
    expect((await asVisitor(db, [box('a', 'again'), board])).status).toBe(200);
    expect(stored(db).map((e) => e.id)).toEqual(['a', 'b1']);
  });
});

// docs/specs/013-workspace/tab-scoped-share-links.md "Structure": a link to one tab saves its content, and the tab
// keeps its stored name and the Plan elements that pull cards onto it.
describe('a tab-scoped save', () => {
  it('lands the content, keeping the stored name and dropping a Plan card the save added', async () => {
    const db = await documentWith([box('a')]);
    await createShareLink(db.env, 'D', 'SCOPED01', 'edit', 'never', 't1');
    const card = {
      id: 'pc',
      type: 'shape',
      shape: 'plan-card',
      x: 400,
      y: 0,
      width: 240,
      height: 120,
      planCard: { itemId: 'card01', size: 'compact' },
    } as unknown as Element;
    const res = await handleDocuments(
      makeTestRouteContext('PUT', '/api/documents/D/tabs/t1', {
        env: db.env,
        owner: 'guest-1',
        headers: { 'X-Share-Code': 'SCOPED01' },
        body: { id: 't1', name: 'Mine now', elements: [box('a', 'edited'), card] },
      }),
    );
    expect(res.status).toBe(200);
    expect(db.sql.prepare("SELECT name FROM tabs WHERE id = 't1'").get()).toEqual({
      name: 'Board',
    });
    expect(stored(db).map((e) => [e.id, (e as { label?: string }).label])).toEqual([
      ['a', 'edited'],
    ]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { base64OfBytes } from '@livedoc/text-documents';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleDocuments } from '../routes/documents';
import { makeTestRouteContext } from '../routes/test-route-context';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { liveTabKind, type LiveTabKind } from './live-tab-kind';
import { LIVE_TAB_KINDS, liveTabKindOfFrame, liveTabKindOfTab } from './live-tab-kinds';
import { refreshLiveTabDigest } from './live-tab-digest';
import { liveTabLimitOf } from './live-tab-limits';
import { liveTabSchemaStep } from './live-tab-schema';
import { compactLiveTab, readLiveTabState, storedUpdates } from './live-tab-store';
import { RoomLiveTabs } from './room-live-tabs';

// docs/specs/006-document/kinds-outside-the-canvas.md "Live state": a kind declares only what is its own; the room
// stores, compacts, digests, limits and relays every kind's state the same way, in the tables its schema step makes.

const ws = {} as WebSocket;
const bytes = (text: string) => new TextEncoder().encode(text);
const text = (update: Uint8Array) => new TextDecoder().decode(update);

// A kind whose updates are text that joins: plain enough to see what the room did with them.
const NOTES = liveTabKind({
  tabKind: 'test-notes',
  frame: 'test-notes',
  tag: '[test-notes]',
  tables: {
    updates: 'test_notes_updates',
    chunks: 'test_notes_chunks',
    digest: 'test_notes_digest',
  },
  state: {
    merge: (updates) => bytes(updates.map(text).join('')),
    decodes: (update) => !text(update).includes('!'),
    insertedCharacters: (update) => text(update).length,
    digest: (updates) => {
      const all = updates.map(text).join('');
      return {
        characters: all.length,
        words: 1,
        pages: 1,
        hasContent: all.length > 0,
        searchText: all,
      };
    },
  },
  sizes: { chunkBytes: 4, logBytes: 10, logUpdates: 3, frameChars: 8 },
  caps: { characters: 20, stateBytes: 1000 },
});

async function roomWith(db: SqliteD1) {
  db.sql.exec(liveTabSchemaStep(NOTES.tables));
  await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'owner',
      body: {
        id: 'D',
        name: 'D',
        tabs: [
          { id: 'n1', name: 'N', kind: 'test-notes', elements: [] },
          { id: 'c', name: 'C', elements: [] },
        ],
      },
    }),
  );
  const sequence = vi.fn(() => 3);
  const sendTo = vi.fn();
  const room = new RoomLiveTabs(NOTES, {
    env: db.env,
    enqueue: (step) => step(),
    sequence,
    sendTo,
    position: () => ({ epoch: 'e' }),
  });
  return { room, sequence, sendTo };
}

const frame = (tabId: string, words: string) => ({
  kind: 'test-notes',
  tabId,
  update: base64OfBytes(bytes(words)),
});

describe('a live tab kind of its own', () => {
  it('stores, relays and reads back its updates in its own tables', async () => {
    const db = sqliteD1();
    const { room, sequence } = await roomWith(db);
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'edit' as const,
      adderKey: null,
    };
    expect(await room.accept(sender, frame('n1', 'ab'))).toBe(true);
    expect(await room.accept(sender, frame('n1', 'cd'))).toBe(true);
    expect(sequence).toHaveBeenCalledTimes(2);
    expect(text(await readLiveTabState(db.env, NOTES, 'n1'))).toBe('abcd');
    // Never in another kind's tables.
    const rows = db.sql.prepare('SELECT COUNT(*) AS n FROM text_document_updates').get() as {
      n: number;
    };
    expect(rows.n).toBe(0);
  });

  it('refuses a frame for a tab of another kind, one that does not decode, and one past a limit', async () => {
    const db = sqliteD1();
    const { room, sendTo } = await roomWith(db);
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'edit' as const,
      adderKey: null,
    };
    expect(await room.accept(sender, frame('c', 'ab'))).toBe(false);
    expect(await room.accept(sender, frame('n1', 'no!'))).toBe(false);
    expect(await room.accept(sender, frame('n1', 'x'.repeat(21)))).toBe(false);
    expect(sendTo).toHaveBeenCalledWith(ws, {
      kind: 'op',
      from: 'system',
      op: { kind: 'test-notes-refused', tabId: 'n1', limit: 'characters' },
    });
    expect(
      await liveTabLimitOf(db.env, NOTES, 'n1', bytes('x'), { characters: 20, stateBytes: 0 }),
    ).toBe('state');
  });

  it('compacts its log into chunks under its row size once past its count', async () => {
    const db = sqliteD1();
    const { room } = await roomWith(db);
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'edit' as const,
      adderKey: null,
    };
    for (const part of ['a', 'b', 'c', 'd']) await room.accept(sender, frame('n1', part));
    const chunks = db.sql
      .prepare('SELECT LENGTH(bytes) AS size FROM test_notes_chunks ORDER BY idx')
      .all() as { size: number }[];
    expect(chunks.map((c) => c.size)).toEqual([4]);
    expect(text(await readLiveTabState(db.env, NOTES, 'n1'))).toBe('abcd');
    expect(await compactLiveTab(db.env, NOTES, 'n1', bytes('efgh!'))).toBe(3);
    expect((await storedUpdates(db.env, NOTES, 'n1')).map(text)).toEqual(['abcdefgh!']);
  });

  it('relays a posted update too big for a frame as the tab\u2019s stale', async () => {
    const db = sqliteD1();
    const { room, sequence } = await roomWith(db);
    expect(await room.acceptPosted('D', 'n1', bytes('abcdefgh'))).toBe('stored');
    expect(sequence).toHaveBeenLastCalledWith('system', {
      kind: 'test-notes',
      tabId: 'n1',
      stale: true,
    });
    expect(await room.acceptPosted('D', 'c', bytes('ab'))).toBe('wrong-kind');
  });

  it('keeps its digest beside the tab, queuing the document\u2019s summary', async () => {
    const db = sqliteD1();
    const { room } = await roomWith(db);
    await room.accept(
      { ws, presenceId: 'p1', documentId: 'D', level: 'edit' as const, adderKey: null },
      frame('n1', 'hello'),
    );
    const digest = await refreshLiveTabDigest(db.env, NOTES, 'D', 'n1');
    expect(digest.searchText).toBe('hello');
    expect(db.sql.prepare('SELECT characters, has_content FROM test_notes_digest').get()).toEqual({
      characters: 5,
      has_content: 1,
    });
  });

  // "The digest and summary": logged `digest` with every count the kind's digest holds.
  it('logs its digest with every count the kind\u2019s digest holds', async () => {
    const db = sqliteD1();
    const { room } = await roomWith(db);
    await room.accept(
      { ws, presenceId: 'p1', documentId: 'D', level: 'edit' as const, adderKey: null },
      frame('n1', 'hello'),
    );
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const counting: LiveTabKind = {
      ...NOTES,
      state: {
        ...NOTES.state,
        digest: (updates) => ({ ...NOTES.state.digest(updates), marks: 2 }),
      },
    };
    await refreshLiveTabDigest(db.env, counting, 'D', 'n1');
    const logged = info.mock.calls.map(([message]) => message as string);
    info.mockRestore();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(
      /^\[test-notes\] digest document=D tab=n1 characters=5 words=1 pages=1 marks=2 images=0 bytes=5 ms=\d+$/,
    );
  });
});

describe('the live tab kinds', () => {
  it('hold the text document, found by its tab and its frame', () => {
    expect(LIVE_TAB_KINDS).toContain(TEXT_DOCUMENT_LIVE_TAB);
    expect(liveTabKindOfTab({ kind: 'text-document' })).toBe(TEXT_DOCUMENT_LIVE_TAB);
    expect(liveTabKindOfTab({ kind: 'board' })).toBeNull();
    expect(liveTabKindOfTab(undefined)).toBeNull();
    expect(liveTabKindOfFrame('text-document')).toBe(TEXT_DOCUMENT_LIVE_TAB);
    expect(liveTabKindOfFrame('el')).toBeNull();
  });

  it('refuse a table name that is not a plain identifier', () => {
    const bad = {
      ...NOTES,
      tables: { ...NOTES.tables, chunks: 'x; DROP TABLE tabs' },
    } as LiveTabKind;
    expect(() => liveTabKind(bad)).toThrow(/bad table/);
  });

  it('build the step that makes the text document\u2019s shipped tables, column for column', () => {
    // The room's schema as shipped, the step built beside it under other names.
    const { sql } = sqliteD1();
    const columns = (table: string) => sql.prepare(`PRAGMA table_info(${table})`).all();
    const renamed = {
      updates: 'built_updates',
      chunks: 'built_chunks',
      digest: 'built_digest',
    };
    sql.exec(liveTabSchemaStep(renamed));
    const { tables } = TEXT_DOCUMENT_LIVE_TAB;
    expect(columns(renamed.updates)).toEqual(columns(tables.updates));
    expect(columns(renamed.chunks)).toEqual(columns(tables.chunks));
    expect(columns(renamed.digest)).toEqual(columns(tables.digest));
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  Body,
  TextDocumentState,
  TEXT_DOCUMENT_CHUNK_BYTES,
  TEXT_DOCUMENT_FRAME_CHARS,
  TEXT_DOCUMENT_LOG_BYTES,
  TEXT_DOCUMENT_LOG_UPDATES,
  TEXT_DOCUMENT_MAX_CHARS,
} from '@livedoc/text-documents';
import { gateClientOp } from '../room-op-gate';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { makeTestRouteContext } from '../routes/test-route-context';
import { handleDocuments } from '../routes/documents';
import { base64OfBytes } from '@livedoc/text-documents';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { RoomLiveTabs, liveTabFrameOf } from './room-live-tabs';
import { storedUpdates as storedOf } from './live-tab-store';

const storedUpdates = (env: Parameters<typeof storedOf>[0], tabId: string) =>
  storedOf(env, TEXT_DOCUMENT_LIVE_TAB, tabId);

// docs/specs/034-text-documents/live-editing-and-storage.md "Storage" and "Share roles": the room is the one writer,
// stores an update before relaying it, and relays a text document's edits from an Editor only.

const ws = {} as WebSocket;

// Sized past the spec's character limit: the compaction and folding tests store more text than one document holds.
const ROOMY = { characters: Number.MAX_SAFE_INTEGER, stateBytes: Number.MAX_SAFE_INTEGER };

async function roomWith(db: SqliteD1, caps?: typeof ROOMY) {
  await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'owner',
      body: {
        id: 'D',
        name: 'D',
        tabs: [
          { id: 't1', name: 'T', kind: 'text-document', elements: [] },
          { id: 'c', name: 'C', elements: [] },
        ],
      },
    }),
  );
  const sequence = vi.fn(() => 7);
  const sendTo = vi.fn();
  const room = new RoomLiveTabs(TEXT_DOCUMENT_LIVE_TAB, {
    env: db.env,
    enqueue: (step) => step(),
    sequence,
    sendTo,
    position: () => ({ epoch: 'e' }),
    ...(caps ? { caps } : {}),
  });
  return { room, sequence, sendTo };
}

const frame = (tabId: string, text: string) => ({
  kind: 'text-document',
  tabId,
  update: base64OfBytes(TextDocumentState.fromBody(Body.of(text))),
});

describe('RoomLiveTabs, for a text document', () => {
  it('stores an update, then relays it and tells the sender its seq', async () => {
    const db = sqliteD1();
    const { room, sequence, sendTo } = await roomWith(db);
    const op = frame('t1', 'Typed');
    expect(
      await room.accept({ ws, presenceId: 'p1', documentId: 'D', level: 'edit' as const }, op, 4),
    ).toBe(true);
    expect(await storedUpdates(db.env, 't1')).toHaveLength(1);
    expect(sequence).toHaveBeenCalledWith('p1', op, ws);
    expect(sendTo).toHaveBeenCalledWith(ws, { kind: 'cursor', epoch: 'e', seq: 7, ref: 4 });
  });

  it('refuses a frame that is malformed, does not decode, or is not for a text document', async () => {
    const db = sqliteD1();
    const { room, sequence } = await roomWith(db);
    const sender = { ws, presenceId: 'p1', documentId: 'D', level: 'edit' as const };
    expect(await room.accept(sender, { kind: 'text-document', tabId: 't1' })).toBe(false);
    expect(
      await room.accept(sender, {
        ...frame('t1', 'x'),
        update: base64OfBytes(Uint8Array.of(9, 9, 9)),
      }),
    ).toBe(false);
    expect(await room.accept(sender, { ...frame('t1', 'x'), update: '***' })).toBe(false);
    expect(await room.accept(sender, frame('c', 'x'))).toBe(false);
    expect(await room.accept({ ...sender, documentId: null }, frame('t1', 'x'))).toBe(false);
    expect(sequence).not.toHaveBeenCalled();
    expect(await storedUpdates(db.env, 't1')).toEqual([]);
  });

  it('compacts the log once it passes its size', async () => {
    const db = sqliteD1();
    const { room } = await roomWith(db, ROOMY);
    const sender = { ws, presenceId: 'p1', documentId: 'D', level: 'edit' as const };
    // Text that does not compress in an update: one big paragraph past the log's size.
    const big = Array.from({ length: TEXT_DOCUMENT_LOG_BYTES / 6 }, (_, i) =>
      (i * 7919).toString(36).padStart(6, '0'),
    ).join('');
    expect(await room.accept(sender, frame('t1', big))).toBe(true);
    const rows = db.sql.prepare('SELECT COUNT(*) AS n FROM text_document_updates').get() as {
      n: number;
    };
    expect(rows.n).toBe(0);
    const chunks = db.sql.prepare('SELECT COUNT(*) AS n FROM text_document_chunks').get() as {
      n: number;
    };
    expect(chunks.n).toBeGreaterThan(1);
    const state = TextDocumentState.load(await storedUpdates(db.env, 't1'));
    expect(TextDocumentState.paragraphs(state)).toEqual(Body.of(big));
  });

  it('stores an update sent by the door and relays it as an op when it fits a frame', async () => {
    const db = sqliteD1();
    const { room, sequence } = await roomWith(db);
    const update = TextDocumentState.fromBody(Body.of('Pasted'));
    expect(await room.acceptPosted('D', 't1', update)).toBe('stored');
    expect(await storedUpdates(db.env, 't1')).toHaveLength(1);
    expect(sequence).toHaveBeenCalledWith('system', {
      kind: 'text-document',
      tabId: 't1',
      update: base64OfBytes(update),
    });
  });

  it('folds a door update past a chunk into the chunks and tells everyone the tab is stale', async () => {
    const db = sqliteD1();
    const { room, sequence } = await roomWith(db, ROOMY);
    const big = Array.from({ length: TEXT_DOCUMENT_CHUNK_BYTES / 5 }, (_, i) =>
      (i * 7919).toString(36).padStart(6, '0'),
    ).join('');
    const update = TextDocumentState.fromBody(Body.of(big));
    expect(update.byteLength).toBeGreaterThan(TEXT_DOCUMENT_CHUNK_BYTES);
    expect(await room.acceptPosted('D', 't1', update)).toBe('stored');
    const logged = db.sql.prepare('SELECT COUNT(*) AS n FROM text_document_updates').get() as {
      n: number;
    };
    expect(logged.n).toBe(0);
    const state = TextDocumentState.load(await storedUpdates(db.env, 't1'));
    expect(TextDocumentState.paragraphs(state)).toEqual(Body.of(big));
    expect(sequence).toHaveBeenCalledWith('system', {
      kind: 'text-document',
      tabId: 't1',
      stale: true,
    });
  });

  it('relays a door update too large for a frame as stale, stored in the log', async () => {
    const db = sqliteD1();
    const { room, sequence } = await roomWith(db);
    const text = Array.from({ length: TEXT_DOCUMENT_FRAME_CHARS / 5 }, (_, i) =>
      (i * 7919).toString(36).padStart(6, '0'),
    ).join('');
    expect(await room.acceptPosted('D', 't1', TextDocumentState.fromBody(Body.of(text)))).toBe(
      'stored',
    );
    expect(await storedUpdates(db.env, 't1')).toHaveLength(1);
    expect(sequence).toHaveBeenCalledWith('system', {
      kind: 'text-document',
      tabId: 't1',
      stale: true,
    });
  });

  it('refuses a door update that does not decode or is for no text document', async () => {
    const db = sqliteD1();
    const { room, sequence } = await roomWith(db);
    expect(await room.acceptPosted('D', 't1', Uint8Array.of(9, 9, 9))).toBe('decode');
    expect(await room.acceptPosted('D', 'c', TextDocumentState.fromBody(Body.of('x')))).toBe(
      'wrong-kind',
    );
    expect(sequence).not.toHaveBeenCalled();
  });

  // live-editing-and-storage.md "Storage": reading merges the log, and merging many small updates grows faster than
  // their count, so a log of keystrokes is folded long before it passes its size.
  it('compacts the log once it holds its count of updates', async () => {
    const db = sqliteD1();
    const { room } = await roomWith(db);
    const sender = { ws, presenceId: 'p1', documentId: 'D', level: 'edit' as const };
    const doc = TextDocumentState.load();
    const updates: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(u));
    TextDocumentState.replaceBody(doc, Body.of(''));
    for (let i = 0; i < TEXT_DOCUMENT_LOG_UPDATES + 1; i++)
      TextDocumentState.replaceBody(doc, Body.of('x'.repeat(i + 1)));
    for (const update of updates.slice(-TEXT_DOCUMENT_LOG_UPDATES - 1))
      await room.accept(sender, {
        kind: 'text-document',
        tabId: 't1',
        update: base64OfBytes(update),
      });
    const rows = db.sql.prepare('SELECT COUNT(*) AS n FROM text_document_updates').get() as {
      n: number;
    };
    expect(rows.n).toBeLessThanOrEqual(1);
  });

  // live-editing-and-storage.md "Refused edits": refused whole, the sender alone told which limit.
  it('refuses a frame past the characters, storing nothing and telling only the sender', async () => {
    const db = sqliteD1();
    const { room, sequence, sendTo } = await roomWith(db);
    db.sql
      .prepare(
        `INSERT OR REPLACE INTO text_document_digest (tab_id, characters, words, pages, has_content, state_bytes, written_at)
         VALUES ('t1', ?, 0, 1, 1, 0, 1)`,
      )
      .run(TEXT_DOCUMENT_MAX_CHARS);
    const sender = { ws, presenceId: 'p1', documentId: 'D', level: 'edit' as const };
    expect(await room.accept(sender, frame('t1', 'x'))).toBe(false);
    expect(await storedUpdates(db.env, 't1')).toEqual([]);
    expect(sequence).not.toHaveBeenCalled();
    expect(sendTo).toHaveBeenCalledWith(ws, {
      kind: 'op',
      from: 'system',
      op: { kind: 'text-document-refused', tabId: 't1', limit: 'characters' },
    });
    expect(await room.acceptPosted('D', 't1', TextDocumentState.fromBody(Body.of('y')))).toBe(
      'characters',
    );
  });

  it('compacts the log when the door’s updates fill it', async () => {
    const db = sqliteD1();
    const { room } = await roomWith(db);
    const doc = TextDocumentState.load();
    const updates: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(u));
    for (let i = 0; i < TEXT_DOCUMENT_LOG_UPDATES + 1; i++)
      TextDocumentState.replaceBody(doc, Body.of('x'.repeat(i + 1)));
    for (const update of updates) expect(await room.acceptPosted('D', 't1', update)).toBe('stored');
    const rows = db.sql.prepare('SELECT COUNT(*) AS n FROM text_document_updates').get() as {
      n: number;
    };
    expect(rows.n).toBeLessThan(TEXT_DOCUMENT_LOG_UPDATES);
  });

  it('stores nothing sent by the door where the room has no storage', async () => {
    const room = new RoomLiveTabs(TEXT_DOCUMENT_LIVE_TAB, {
      env: undefined,
      enqueue: (step) => step(),
      sequence: () => 0,
      sendTo: () => {},
      position: () => ({ epoch: 'e' }),
    });
    expect(await room.acceptPosted('D', 't1', TextDocumentState.fromBody(Body.of('y')))).toBe(
      'no-store',
    );
  });

  it('reads only a whole frame', () => {
    expect(liveTabFrameOf(TEXT_DOCUMENT_LIVE_TAB, null)).toBeNull();
    expect(liveTabFrameOf(TEXT_DOCUMENT_LIVE_TAB, { kind: 'el' })).toBeNull();
    expect(
      liveTabFrameOf(TEXT_DOCUMENT_LIVE_TAB, { kind: 'text-document', tabId: 1, update: '' }),
    ).toBeNull();
  });
});

// kinds-outside-the-canvas.md "Live state", "The level an update asks": a kind that reads no level asks an Editor.
describe('a text document frame from a level too low', () => {
  it.each(['participate', 'view'] as const)(
    'refuses a frame from %s whole, telling the sender alone',
    async (level) => {
      const db = sqliteD1();
      const { room, sequence, sendTo } = await roomWith(db);
      const sender = { ws, presenceId: 'p1', documentId: 'D', level };
      expect(await room.accept(sender, frame('t1', 'x'))).toBe(false);
      expect(await storedUpdates(db.env, 't1')).toEqual([]);
      expect(sequence).not.toHaveBeenCalled();
      expect(sendTo).toHaveBeenCalledWith(ws, {
        kind: 'op',
        from: 'system',
        op: { kind: 'text-document-refused', tabId: 't1', name: 'level_too_low' },
      });
      expect(
        await room.acceptPosted('D', 't1', TextDocumentState.fromBody(Body.of('y')), { level }),
      ).toBe('level');
    },
  );
});

describe('the role gate on text document edits', () => {
  const op = frame('t1', 'x');
  it('hands a live tab’s frame to the room’s own check, with the sender’s level', () => {
    expect(gateClientOp(op, { role: 'edit', tabScope: null, key: undefined })).toEqual({
      kind: 'live-tab',
      level: 'edit',
    });
    expect(gateClientOp(op, { role: 'participate', tabScope: null, key: 'k' })).toEqual({
      kind: 'live-tab',
      level: 'participate',
    });
    expect(gateClientOp(op, { role: 'view', tabScope: null, key: undefined })).toEqual({
      kind: 'live-tab',
      level: 'view',
    });
    expect(gateClientOp(op, { role: 'nonsense', tabScope: null, key: undefined })).toEqual({
      kind: 'live-tab',
      level: 'view',
    });
  });

  it('keeps a tab-scoped Editor to its own tab', () => {
    expect(gateClientOp(op, { role: 'edit', tabScope: 'other', key: undefined })).toEqual({
      kind: 'drop',
    });
  });
});

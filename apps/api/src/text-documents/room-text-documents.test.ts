import { describe, expect, it, vi } from 'vitest';
import { Body, TextDocumentState, TEXT_DOCUMENT_LOG_BYTES } from '@livedoc/text-documents';
import { gateClientOp } from '../room-op-gate';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { makeTestRouteContext } from '../routes/test-route-context';
import { handleDocuments } from '../routes/documents';
import { base64OfBytes } from '@livedoc/text-documents';
import { RoomTextDocuments, textDocumentFrameOf } from './room-text-documents';
import { storedUpdates } from './text-document-store';

// docs/specs/034-text-documents/live-editing-and-storage.md "Storage" and "Share roles": the room is the one writer,
// stores an update before relaying it, and relays a text document's edits from an Editor only.

const ws = {} as WebSocket;

async function roomWith(db: SqliteD1) {
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
  const room = new RoomTextDocuments({
    env: db.env,
    enqueue: (step) => step(),
    sequence,
    sendTo,
    position: () => ({ epoch: 'e' }),
  });
  return { room, sequence, sendTo };
}

const frame = (tabId: string, text: string) => ({
  kind: 'text-document',
  tabId,
  update: base64OfBytes(TextDocumentState.fromBody(Body.of(text))),
});

describe('RoomTextDocuments', () => {
  it('stores an update, then relays it and tells the sender its seq', async () => {
    const db = sqliteD1();
    const { room, sequence, sendTo } = await roomWith(db);
    const op = frame('t1', 'Typed');
    expect(await room.accept({ ws, presenceId: 'p1', documentId: 'D' }, op, 4)).toBe(true);
    expect(await storedUpdates(db.env, 't1')).toHaveLength(1);
    expect(sequence).toHaveBeenCalledWith('p1', op, ws);
    expect(sendTo).toHaveBeenCalledWith(ws, { kind: 'cursor', epoch: 'e', seq: 7, ref: 4 });
  });

  it('refuses a frame that is malformed, does not decode, or is not for a text document', async () => {
    const db = sqliteD1();
    const { room, sequence } = await roomWith(db);
    const sender = { ws, presenceId: 'p1', documentId: 'D' };
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
    const { room } = await roomWith(db);
    const sender = { ws, presenceId: 'p1', documentId: 'D' };
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

  it('reads only a whole frame', () => {
    expect(textDocumentFrameOf(null)).toBeNull();
    expect(textDocumentFrameOf({ kind: 'el' })).toBeNull();
    expect(textDocumentFrameOf({ kind: 'text-document', tabId: 1, update: '' })).toBeNull();
  });
});

describe('the role gate on text document edits', () => {
  const op = frame('t1', 'x');
  it('relays an Editor’s and drops a Participant’s and a Viewer’s', () => {
    expect(gateClientOp(op, { role: 'edit', tabScope: null, key: undefined })).toEqual({
      kind: 'relay',
      presence: false,
      participantAnswers: false,
    });
    expect(gateClientOp(op, { role: 'participate', tabScope: null, key: 'k' })).toEqual({
      kind: 'drop',
    });
    expect(gateClientOp(op, { role: 'view', tabScope: null, key: undefined })).toEqual({
      kind: 'drop',
    });
  });

  it('keeps a tab-scoped Editor to its own tab', () => {
    expect(gateClientOp(op, { role: 'edit', tabScope: 'other', key: undefined })).toEqual({
      kind: 'drop',
    });
  });
});

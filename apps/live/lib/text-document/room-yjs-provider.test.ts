// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  base64OfBytes,
  bytesOfBase64,
  Body,
  TEXT_DOCUMENT_FRAME_CHARS,
  TextDocumentState,
} from '@livedoc/text-documents';
import { openRoomYjs, type RoomYjsBinding, type TextDocumentFrame } from './room-yjs-provider';
import { TextDocumentBus } from './text-document-bus';
import type { CopyKey, TextDocumentCopy } from './text-document-copies';

// docs/specs/034-text-documents/live-editing-and-storage.md "Sending", "Reconnecting" and "The local copy".

/** A room that stores what it is sent, and a browser's copies, in memory. */
function harness(opts: { canEdit?: boolean; confirm?: () => boolean } = {}) {
  const stored: Uint8Array[] = [];
  const copies = new Map<string, TextDocumentCopy>();
  const id = (key: CopyKey) => `${key.documentId}/${key.tabId}`;
  const state = () => TextDocumentState.merge(stored);
  const sequence = vi.fn(async (op: TextDocumentFrame) => {
    if (!(opts.confirm?.() ?? true)) return false;
    stored.push(bytesOfBase64(op.update)!);
    return true;
  });
  const post = vi.fn(async (update: Uint8Array) => {
    stored.push(update);
  });
  const deps = {
    documentId: 'D',
    tabId: 't1',
    canEdit: opts.canEdit ?? true,
    sequence,
    post,
    loadState: vi.fn(async () => state()),
    loadSince: vi.fn(async (vector: Uint8Array) => ({
      update: TextDocumentState.since(state(), vector),
      stateVector: TextDocumentState.stateVectorOf(state()),
    })),
    copies: {
      read: vi.fn(async (key: CopyKey) => copies.get(id(key)) ?? null),
      write: vi.fn(async (copy: TextDocumentCopy) => void copies.set(id(copy), copy)),
      remove: vi.fn(async (key: CopyKey) => void copies.delete(id(key))),
    },
    saveDelayMs: 0,
  };
  const roomBody = () => TextDocumentState.paragraphs(TextDocumentState.load([state()]));
  return { deps, stored, copies, sequence, post, roomBody };
}

const type = (binding: RoomYjsBinding, ...texts: string[]) =>
  TextDocumentState.replaceBody(binding.doc, Body.of(...texts));
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

let open: RoomYjsBinding[] = [];
const opened = async (deps: Parameters<typeof openRoomYjs>[0]) => {
  const binding = await openRoomYjs(deps);
  open.push(binding);
  return binding;
};

beforeEach(() => TextDocumentBus.connected());
afterEach(() => {
  for (const binding of open) binding.close();
  open = [];
  TextDocumentBus.disconnected();
});

describe('openRoomYjs', () => {
  it('keeps an update the room relays while the state is being read', async () => {
    const h = harness();
    const room = TextDocumentState.load([TextDocumentState.seed()]);
    TextDocumentState.replaceBody(room, Body.of('Arrived early'));
    h.deps.loadState.mockImplementationOnce(async () => {
      // Relayed between the read and the binding: never in the state this surface reads.
      TextDocumentBus.deliver({ tabId: 't1', update: base64OfBytes(Y.encodeStateAsUpdate(room)) });
      return TextDocumentState.seed();
    });
    const binding = await opened(h.deps);
    expect(TextDocumentState.paragraphs(binding.doc)).toEqual(Body.of('Arrived early'));
  });

  it('sends an edit as one frame while the room is open, and keeps no copy once it is confirmed', async () => {
    const h = harness();
    const binding = await opened(h.deps);
    type(binding, 'Typed');
    await tick();
    expect(h.sequence).toHaveBeenCalledTimes(1);
    expect(h.roomBody()).toEqual(Body.of('Typed'));
    expect(h.deps.copies.write).not.toHaveBeenCalled();
  });

  it('sends nothing while the room is closed, keeps a copy, and catches up when it opens', async () => {
    const h = harness();
    const binding = await opened(h.deps);
    TextDocumentBus.disconnected();
    type(binding, 'Written offline');
    await tick();
    expect(h.sequence).not.toHaveBeenCalled();
    expect(h.copies.size).toBe(1);
    TextDocumentBus.connected();
    await tick();
    await binding.settled();
    expect(h.roomBody()).toEqual(Body.of('Written offline'));
    expect(h.copies.size).toBe(0);
  });

  it('catches up when the room opens after the state was read with it closed', async () => {
    const h = harness();
    TextDocumentBus.disconnected();
    const binding = await opened(h.deps);
    expect(h.deps.loadSince).not.toHaveBeenCalled();
    // Stored by someone else before this browser's socket opened: no replay reaches a first socket.
    const other = TextDocumentState.load([TextDocumentState.seed()]);
    TextDocumentState.replaceBody(other, Body.of('Theirs'));
    h.stored.push(Y.encodeStateAsUpdate(other));
    TextDocumentBus.connected();
    await tick();
    expect(TextDocumentState.paragraphs(binding.doc)).toEqual(Body.of('Theirs'));
  });

  it('sends an update too large for a frame by the door', async () => {
    const h = harness();
    const binding = await opened(h.deps);
    const long = Array.from({ length: TEXT_DOCUMENT_FRAME_CHARS / 4 }, (_, i) =>
      (i * 7919).toString(36).padStart(6, '0'),
    ).join('');
    type(binding, long);
    await tick();
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.sequence).not.toHaveBeenCalled();
    expect(h.roomBody()).toEqual(Body.of(long));
  });

  it('merges a copy left behind at open and sends what the room lacks, then drops the copy', async () => {
    const h = harness();
    const before = TextDocumentState.load([TextDocumentState.seed()]);
    TextDocumentState.replaceBody(before, Body.of('Left in this browser'));
    h.copies.set('D/t1', {
      documentId: 'D',
      tabId: 't1',
      update: Y.encodeStateAsUpdate(before),
      savedAt: 1,
    });
    const binding = await opened(h.deps);
    await tick();
    await binding.settled();
    expect(TextDocumentState.paragraphs(binding.doc)).toEqual(Body.of('Left in this browser'));
    expect(h.roomBody()).toEqual(Body.of('Left in this browser'));
    expect(h.copies.size).toBe(0);
  });

  it('drops a copy the room already holds', async () => {
    const h = harness();
    h.copies.set('D/t1', {
      documentId: 'D',
      tabId: 't1',
      update: TextDocumentState.seed(),
      savedAt: 1,
    });
    const binding = await opened(h.deps);
    await binding.settled();
    expect(h.copies.size).toBe(0);
    expect(h.sequence).not.toHaveBeenCalled();
  });

  it('catches up at once after a frame the open room did not confirm', async () => {
    let confirm = false;
    const h = harness({ confirm: () => confirm });
    const binding = await opened(h.deps);
    h.deps.loadSince.mockImplementationOnce(async (vector) => {
      confirm = true;
      return {
        update: TextDocumentState.since(TextDocumentState.merge(h.stored), vector),
        stateVector: TextDocumentState.stateVectorOf(TextDocumentState.merge(h.stored)),
      };
    });
    type(binding, 'Unconfirmed');
    await tick();
    await binding.settled();
    expect(h.roomBody()).toEqual(Body.of('Unconfirmed'));
    expect(h.copies.size).toBe(0);
  });

  it('re-reads its own tab when it goes stale, and no other', async () => {
    const h = harness();
    await opened(h.deps);
    TextDocumentBus.deliver({ tabId: 'other', stale: true });
    await tick();
    expect(h.deps.loadSince).not.toHaveBeenCalled();
    TextDocumentBus.deliver({ tabId: 't1', stale: true });
    await tick();
    expect(h.deps.loadSince).toHaveBeenCalledTimes(1);
  });

  it('never sends for a viewer', async () => {
    const h = harness({ canEdit: false });
    const binding = await opened(h.deps);
    type(binding, 'Not mine to send');
    TextDocumentBus.resync(null);
    await tick();
    expect(h.sequence).not.toHaveBeenCalled();
    expect(h.post).not.toHaveBeenCalled();
    expect(h.copies.size).toBe(0);
  });

  it('shows a copy left behind to a viewer, and leaves it for a session that may send it', async () => {
    const h = harness({ canEdit: false });
    const before = TextDocumentState.load([TextDocumentState.seed()]);
    TextDocumentState.replaceBody(before, Body.of('Unsent'));
    h.copies.set('D/t1', {
      documentId: 'D',
      tabId: 't1',
      update: Y.encodeStateAsUpdate(before),
      savedAt: 1,
    });
    const binding = await opened(h.deps);
    TextDocumentBus.resync(null);
    await tick();
    await binding.settled();
    expect(TextDocumentState.paragraphs(binding.doc)).toEqual(Body.of('Unsent'));
    expect(h.copies.size).toBe(1);
    expect(h.sequence).not.toHaveBeenCalled();
  });

  it('keeps an unconfirmed edit in the copy when it closes', async () => {
    const h = harness({ confirm: () => false });
    h.deps.saveDelayMs = 60_000;
    TextDocumentBus.disconnected();
    const binding = await opened(h.deps);
    type(binding, 'Closing');
    binding.close();
    await binding.settled();
    const copy = h.copies.get('D/t1');
    expect(TextDocumentState.paragraphs(TextDocumentState.load([copy!.update]))).toEqual(
      Body.of('Closing'),
    );
  });

  it('keeps an unconfirmed edit at once when the page is left, not after the delay', async () => {
    const h = harness();
    h.deps.saveDelayMs = 60_000;
    TextDocumentBus.disconnected();
    const binding = await opened(h.deps);
    type(binding, 'Leaving');
    expect(h.deps.copies.write).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    await binding.settled();
    expect(h.copies.size).toBe(1);
  });

  it('rejects when the state cannot be read, and stops listening', async () => {
    const h = harness();
    h.deps.loadState.mockRejectedValueOnce(new Error('offline'));
    await expect(openRoomYjs(h.deps)).rejects.toThrow('offline');
    TextDocumentBus.deliver({ tabId: 't1', stale: true });
    await tick();
    expect(h.deps.loadSince).not.toHaveBeenCalled();
  });
});

// docs/specs/034-text-documents/editing-surface.md "The title row": what the save status reads.
describe('openRoomYjs save facts', () => {
  const long = () =>
    Array.from({ length: TEXT_DOCUMENT_FRAME_CHARS / 4 }, (_, i) =>
      (i * 7919).toString(36).padStart(6, '0'),
    ).join('');

  it('is pending while an edit awaits the room, and settles once it is confirmed', async () => {
    const h = harness();
    let answer: (stored: boolean) => void = () => {};
    h.sequence.mockImplementationOnce(
      (op) =>
        new Promise<boolean>((resolve) => {
          answer = (stored) => {
            if (stored) h.stored.push(bytesOfBase64(op.update)!);
            resolve(stored);
          };
        }),
    );
    const binding = await opened(h.deps);
    const seen: boolean[] = [];
    binding.saveFacts.subscribe(() => seen.push(binding.saveFacts.get().pending));
    expect(binding.saveFacts.get()).toEqual({ pending: false, failed: false });
    type(binding, 'Typed');
    expect(binding.saveFacts.get().pending).toBe(true);
    answer(true);
    await tick();
    expect(binding.saveFacts.get()).toEqual({ pending: false, failed: false });
    expect(seen).toEqual([true, false]);
  });

  it('fails when the door refuses an update, until a catch-up stores it', async () => {
    const h = harness();
    h.post.mockRejectedValueOnce(new Error('413'));
    const binding = await opened(h.deps);
    type(binding, long());
    await tick();
    expect(binding.saveFacts.get()).toEqual({ pending: true, failed: true });
    TextDocumentBus.disconnected();
    TextDocumentBus.connected();
    await tick();
    await binding.settled();
    expect(binding.saveFacts.get()).toEqual({ pending: false, failed: false });
  });

  it('fails while closed when this browser cannot keep the copy, and recovers when a copy is kept', async () => {
    const h = harness();
    const binding = await opened(h.deps);
    TextDocumentBus.disconnected();
    h.deps.copies.write.mockRejectedValueOnce(new Error('quota'));
    type(binding, 'Offline one');
    await tick();
    await binding.settled();
    expect(binding.saveFacts.get()).toEqual({ pending: true, failed: true });
    type(binding, 'Offline two');
    await tick();
    await binding.settled();
    expect(binding.saveFacts.get()).toEqual({ pending: true, failed: false });
  });
});

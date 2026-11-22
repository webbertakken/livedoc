// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { BlobKey } from '@livedoc/document';
import { Mark, PdfLiveChanges, type Quad } from '@livedoc/pdf-documents';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/text-documents/base64';
import { LiveTabRoom } from '@/lib/live-tab/live-tab-bus';
import type { CopyKey, LiveTabCopy } from '@/lib/live-tab/live-tab-copies';
import { PdfDocumentBus, PdfStoredFiles } from './pdf-document-bus';
import type { PdfLiveBinding } from './pdf-live-binding';
import { pdfRoomBinding, type PdfFrame } from './pdf-room-binding';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage" (sending, reconnecting), "Offline and This
// Browser" (the local copy), "Limits" (a refused change); docs/specs/006-document/kinds-outside-the-canvas.md "Live
// state" (a state read earlier is caught up at once; what lies beyond the room; a local copy made on something
// else); live-editing-and-storage.md "A change carried across a replacement" (an unconfirmed change).

const BLOB = 'a'.repeat(64) as BlobKey;
const OTHER_BLOB = 'b'.repeat(64) as BlobKey;
const QUAD: Quad = [72, 716, 300, 716, 72, 700, 300, 700];
const highlight = (id: string) =>
  Mark.highlight({
    id,
    page: 'p:1',
    quads: [QUAD],
    text: 'words',
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
  })!;
const idsIn = (doc: Y.Doc) => PdfLiveChanges.marks(doc).map((mark) => mark.id);

/** A room that stores what it is sent, and a browser's copies, in memory. */
function harness(opts: { canChange?: boolean; confirm?: () => boolean } = {}) {
  const stored: Uint8Array[] = [];
  const copies = new Map<string, LiveTabCopy>();
  let removeFails = false;
  const failRemove = () => {
    removeFails = true;
  };
  const id = (key: CopyKey) => `${key.documentId}/${key.tabId}`;
  const state = () => PdfLiveChanges.merge(stored);
  const sequence = vi.fn(async (op: PdfFrame) => {
    if (!(opts.confirm?.() ?? true)) return false;
    stored.push(bytesOfBase64(op.update)!);
    return true;
  });
  const loadSince = vi.fn(
    async (
      vector: Uint8Array,
    ): Promise<{ update: Uint8Array; stateVector: Uint8Array; storedFile?: BlobKey }> => ({
      update: PdfLiveChanges.since(state(), vector),
      stateVector: PdfLiveChanges.stateVectorOf(state()),
    }),
  );
  const post = vi.fn(async (update: Uint8Array) => void stored.push(update));
  const bind = pdfRoomBinding({
    scope: { ownerId: 'o', documentId: 'D', tabId: 't1', shareCode: null },
    canChange: opts.canChange ?? true,
    sequence,
    post,
    loadSince,
    copies: {
      read: async (key) => copies.get(id(key)) ?? null,
      write: async (copy) => void copies.set(id(copy), copy),
      remove: async (key) => {
        if (removeFails) throw new Error('blocked');
        copies.delete(id(key));
      },
    },
    saveDelayMs: 0,
  });
  /** What the surface read before it opened the stored file. */
  const read = () => ({
    update: state(),
    stateVector: PdfLiveChanges.stateVectorOf(state()),
    storedFile: BLOB,
  });
  const roomMarks = () => idsIn(PdfLiveChanges.load([state()]));
  return { bind, read, stored, copies, sequence, post, loadSince, roomMarks, failRemove };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

let open: PdfLiveBinding[] = [];
const opened = async (h: ReturnType<typeof harness>, read = h.read()) => {
  const binding = await h.bind(read);
  open.push(binding);
  return binding;
};

beforeEach(() => LiveTabRoom.connected());
afterEach(() => {
  for (const binding of open) binding.close();
  open = [];
  LiveTabRoom.disconnected();
});

describe('pdfRoomBinding', () => {
  it('sends a mark as one `pdf` frame while the room is open', async () => {
    const h = harness();
    const binding = await opened(h);
    PdfLiveChanges.addMark(binding.doc, highlight('a'));
    await tick();
    expect(h.sequence).toHaveBeenCalledTimes(1);
    expect(h.sequence.mock.calls[0]![0]).toMatchObject({ kind: 'pdf', tabId: 't1' });
    expect(h.roomMarks()).toEqual(['a']);
  });

  it("shows another person's mark the room relays, and never sends it back", async () => {
    const h = harness();
    const binding = await opened(h);
    await tick();
    const other = PdfLiveChanges.load();
    PdfLiveChanges.addMark(other, highlight('theirs'));
    PdfDocumentBus.deliver({ tabId: 't1', update: base64OfBytes(PdfLiveChanges.encode(other)) });
    expect(idsIn(binding.doc)).toEqual(['theirs']);
    await tick();
    expect(h.sequence).not.toHaveBeenCalled();
  });

  it('reads what the room stored between the read of the state and the binding', async () => {
    const h = harness();
    const read = h.read();
    // Stored and relayed while the surface was opening the stored file: in no state it read, on no bus it heard.
    const other = PdfLiveChanges.load();
    PdfLiveChanges.addMark(other, highlight('between'));
    h.stored.push(PdfLiveChanges.encode(other));
    const binding = await opened(h, read);
    await tick();
    expect(h.loadSince).toHaveBeenCalledTimes(1);
    expect(idsIn(binding.doc)).toEqual(['between']);
  });

  it('sends nothing while the room is closed, keeps a copy, and catches up when it opens', async () => {
    const h = harness();
    const binding = await opened(h);
    await tick();
    LiveTabRoom.disconnected();
    PdfLiveChanges.addMark(binding.doc, highlight('offline'));
    await tick();
    expect(h.sequence).not.toHaveBeenCalled();
    expect(h.copies.size).toBe(1);
    LiveTabRoom.connected();
    await tick();
    expect(h.roomMarks()).toEqual(['offline']);
  });

  it('merges a copy left behind and sends what the room lacks of it', async () => {
    const h = harness();
    const left = PdfLiveChanges.load();
    PdfLiveChanges.addMark(left, highlight('left'));
    h.copies.set('D/t1', {
      documentId: 'D',
      tabId: 't1',
      update: PdfLiveChanges.encode(left),
      savedAt: 1,
    });
    const binding = await opened(h);
    await tick();
    expect(idsIn(binding.doc)).toEqual(['left']);
    expect(h.roomMarks()).toEqual(['left']);
  });

  it('reads as unconfirmed only what the room has not confirmed of what was made here', async () => {
    let confirms = true;
    const h = harness({ confirm: () => confirms });
    const binding = await opened(h);
    await tick();
    expect(binding.unconfirmed()).toEqual([]);
    PdfLiveChanges.addMark(binding.doc, highlight('confirmed'));
    await tick();
    const other = PdfLiveChanges.load();
    PdfLiveChanges.addMark(other, highlight('theirs'));
    PdfDocumentBus.deliver({ tabId: 't1', update: base64OfBytes(PdfLiveChanges.encode(other)) });
    expect(binding.unconfirmed()).toEqual([]);
    confirms = false;
    PdfLiveChanges.addMark(binding.doc, highlight('waiting'));
    PdfLiveChanges.removeMark(binding.doc, 'confirmed');
    await tick();
    expect(binding.unconfirmed()).toEqual([
      { root: 'marks', id: 'confirmed', held: highlight('confirmed'), made: null },
      { root: 'marks', id: 'waiting', held: null, made: highlight('waiting') },
    ]);
  });

  it('reads a change made with the room closed as unconfirmed, until a catch-up stores it', async () => {
    const h = harness();
    const binding = await opened(h);
    await tick();
    LiveTabRoom.disconnected();
    PdfLiveChanges.addMark(binding.doc, highlight('offline'));
    expect(binding.unconfirmed().map((change) => change.id)).toEqual(['offline']);
    LiveTabRoom.connected();
    await tick();
    expect(binding.unconfirmed()).toEqual([]);
  });

  it('reads as confirmed what a catch-up found the room holding', async () => {
    const h = harness();
    const read = h.read();
    const other = PdfLiveChanges.load();
    PdfLiveChanges.addMark(other, highlight('between'));
    h.stored.push(PdfLiveChanges.encode(other));
    const binding = await opened(h, read);
    await tick();
    expect(idsIn(binding.doc)).toEqual(['between']);
    expect(binding.unconfirmed()).toEqual([]);
  });

  it('keeps with the local copy what it was made on and its unconfirmed changes', async () => {
    const h = harness();
    const binding = await opened(h);
    await tick();
    LiveTabRoom.disconnected();
    PdfLiveChanges.addMark(binding.doc, highlight('offline'));
    await tick();
    expect(h.copies.get('D/t1')).toMatchObject({
      on: BLOB,
      beyond: [{ root: 'marks', id: 'offline', held: null, made: highlight('offline') }],
    });
  });

  it('never merges a copy made on another stored file: its changes are handed over, and the copy goes', async () => {
    const h = harness();
    const left = PdfLiveChanges.load();
    PdfLiveChanges.addMark(left, highlight('left'));
    const beyond = [{ root: 'marks', id: 'left', held: null, made: highlight('left') }];
    h.copies.set('D/t1', {
      documentId: 'D',
      tabId: 't1',
      update: PdfLiveChanges.encode(left),
      savedAt: 1,
      on: OTHER_BLOB,
      beyond: [...beyond, { root: 'nowhere', id: 'x', held: null, made: {} }],
    });
    const binding = await opened(h);
    await tick();
    expect(idsIn(binding.doc)).toEqual([]);
    expect(binding.left).toEqual(beyond);
    expect(h.roomMarks()).toEqual([]);
    expect(h.copies.size).toBe(0);
  });

  it("leaves a copy made on another stored file alone on a Viewer's surface", async () => {
    const h = harness({ canChange: false });
    h.copies.set('D/t1', {
      documentId: 'D',
      tabId: 't1',
      update: PdfLiveChanges.encode(PdfLiveChanges.load()),
      savedAt: 1,
      on: OTHER_BLOB,
      beyond: [{ root: 'marks', id: 'left', held: null, made: highlight('left') }],
    });
    const binding = await opened(h);
    await tick();
    expect(binding.left).toEqual([]);
    expect(binding.unconfirmed()).toEqual([]);
    expect(h.copies.size).toBe(1);
  });

  it('says so when a copy made on another stored file cannot be dropped', async () => {
    const h = harness();
    h.failRemove();
    h.copies.set('D/t1', {
      documentId: 'D',
      tabId: 't1',
      update: PdfLiveChanges.encode(PdfLiveChanges.load()),
      savedAt: 1,
      on: OTHER_BLOB,
    });
    const binding = await opened(h);
    await tick();
    expect(binding.left).toEqual([]);
    expect(h.copies.size).toBe(1);
  });

  it("never sends a Viewer's surface's changes", async () => {
    const h = harness({ canChange: false });
    const binding = await opened(h);
    PdfLiveChanges.addMark(binding.doc, highlight('a'));
    await tick();
    expect(h.sequence).not.toHaveBeenCalled();
    expect(h.post).not.toHaveBeenCalled();
  });

  // live-editing-and-storage.md "Limits": a refused change is dropped where it was made, never sent again.
  it('tells the surface of a change the room refuses, and once discarded keeps nothing of it', async () => {
    let confirms = true;
    const h = harness({ confirm: () => confirms });
    const binding = await opened(h);
    PdfLiveChanges.addMark(binding.doc, highlight('kept'));
    await tick();
    const refused = vi.fn();
    binding.onRefused(refused);
    confirms = false;
    PdfLiveChanges.addMark(binding.doc, highlight('refused'));
    PdfDocumentBus.refused('t2', 'state');
    expect(refused).not.toHaveBeenCalled();
    PdfDocumentBus.refused('t1', 'level_too_low');
    expect(refused).toHaveBeenCalledWith('level_too_low');
    await tick();
    expect(h.copies.size).toBe(1);
    await binding.discard();
    expect(h.copies.size).toBe(0);
    // Nothing more is heard, sent or kept: not a late change, not the room opening again, not a close.
    const sent = h.sequence.mock.calls.length;
    const read = h.loadSince.mock.calls.length;
    PdfLiveChanges.addMark(binding.doc, highlight('late'));
    LiveTabRoom.disconnected();
    LiveTabRoom.connected();
    PdfDocumentBus.refused('t1', 'state');
    binding.close();
    await tick();
    expect(h.sequence).toHaveBeenCalledTimes(sent);
    expect(h.loadSince).toHaveBeenCalledTimes(read);
    expect(h.copies.size).toBe(0);
    expect(refused).toHaveBeenCalledTimes(1);
    // The surface binds again from what the room holds.
    const again = await opened(h);
    expect(idsIn(again.doc)).toEqual(['kept']);
  });

  // live-editing-and-storage.md "Storage": every change names the stored file it was made on.
  it('names the stored file on every frame, and to the door', async () => {
    const h = harness();
    const binding = await opened(h);
    PdfLiveChanges.addMark(binding.doc, highlight('m1'));
    await tick();
    expect(h.sequence).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'pdf', on: BLOB }));
  });

  // "Replacing the stored file": however a replacement is learnt, the surface is told once.
  it('tells the surface the stored file was replaced: by the room’s word, or a change refused for it', async () => {
    const h = harness();
    const told = await opened(h);
    const moved = vi.fn();
    const refused = vi.fn();
    told.onMoved(moved);
    told.onRefused(refused);
    PdfStoredFiles.replaced('t2');
    expect(moved).not.toHaveBeenCalled();
    PdfStoredFiles.replaced('t1');
    PdfStoredFiles.replaced('t1');
    PdfDocumentBus.refused('t1', 'stored_file_changed');
    expect(moved).toHaveBeenCalledTimes(1);
    expect(refused).not.toHaveBeenCalled();

    const byRefusal = await opened(harness());
    const again = vi.fn();
    const stop = byRefusal.onMoved(again);
    stop();
    byRefusal.onMoved(again);
    PdfDocumentBus.refused('t1', 'stored_file_changed');
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('merges nothing of a catch-up that reads another stored file’s changes, and says the file was replaced', async () => {
    const h = harness();
    const binding = await opened(h);
    await tick();
    const moved = vi.fn();
    binding.onMoved(moved);
    const other = PdfLiveChanges.load();
    PdfLiveChanges.addMark(other, highlight('theirs'));
    h.loadSince.mockResolvedValueOnce({
      update: PdfLiveChanges.encode(other),
      stateVector: PdfLiveChanges.stateVectorOf(PdfLiveChanges.encode(other)),
      storedFile: 'c'.repeat(64) as BlobKey,
    });
    PdfDocumentBus.resync('t1');
    await tick();
    expect(moved).toHaveBeenCalledTimes(1);
    expect(idsIn(binding.doc)).toEqual([]);
  });

  it('says whether the room holds every change made here', async () => {
    let confirms = false;
    const h = harness({ confirm: () => confirms });
    const binding = await opened(h);
    await tick();
    expect(binding.isSaved()).toBe(true);
    PdfLiveChanges.addMark(binding.doc, highlight('m1'));
    await tick();
    expect(binding.isSaved()).toBe(false);
    confirms = true;
    PdfDocumentBus.resync('t1');
    await tick();
    expect(binding.isSaved()).toBe(true);
    LiveTabRoom.disconnected();
    expect(binding.isSaved()).toBe(false);
  });

  it('sends nothing once closed, whatever answer arrives late', async () => {
    let answer: (stored: boolean) => void = () => {};
    const h = harness();
    const binding = await opened(h);
    await tick();
    h.sequence.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    PdfLiveChanges.addMark(binding.doc, highlight('m1'));
    binding.close();
    const read = h.loadSince.mock.calls.length;
    answer(false);
    await tick();
    expect(h.loadSince).toHaveBeenCalledTimes(read);
  });

  it('says so when this browser cannot drop its copy', async () => {
    const h = harness();
    const binding = await opened(h);
    h.failRemove();
    await expect(binding.discard()).resolves.toBeUndefined();
  });

  it('says Saving while a change is on its way, saved once the room holds it, offline with the room closed', async () => {
    let release: (stored: boolean) => void = () => {};
    const h = harness();
    const binding = await opened(h);
    await tick();
    const status = binding.saveStatus!;
    const seen: (string | null)[] = [];
    const stop = status.subscribe(() => seen.push(status.get()));
    expect(status.get()).toBe('saved');
    h.sequence.mockImplementationOnce(
      (op) =>
        new Promise<boolean>((resolve) => {
          release = (stored) => {
            if (stored) h.stored.push(bytesOfBase64(op.update)!);
            resolve(stored);
          };
        }),
    );
    PdfLiveChanges.addMark(binding.doc, highlight('a'));
    expect(status.get()).toBe('saving');
    release(true);
    await tick();
    expect(status.get()).toBe('saved');
    LiveTabRoom.disconnected();
    expect(status.get()).toBe('offline');
    expect(seen).toEqual(['saving', 'saved', 'offline']);
    stop();
  });

  it('stops hearing the room once closed', async () => {
    const h = harness();
    const binding = await opened(h);
    await tick();
    binding.close();
    open = [];
    const other = PdfLiveChanges.load();
    PdfLiveChanges.addMark(other, highlight('late'));
    PdfDocumentBus.deliver({ tabId: 't1', update: base64OfBytes(PdfLiveChanges.encode(other)) });
    expect(idsIn(binding.doc)).toEqual([]);
  });
});

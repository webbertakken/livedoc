// docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage", "The digest"; the room's side is every live tab
// kind's (docs/specs/006-document/kinds-outside-the-canvas.md "Live state").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_STORED_FILE_HEADER, TEXT_DOCUMENT_STATE_VECTOR_HEADER } from '@livedoc/api-schema';
import { blobKeyOf, type BlobKey } from '@livedoc/document';
import {
  Mark,
  PageName,
  PDF_UPDATE_MAX_BYTES,
  PdfChange,
  PdfLiveChanges,
  type Quad,
} from '@livedoc/pdf-documents';
import { base64OfBytes } from '@livedoc/text-documents';
import { testFilesBucket } from '../blob-store/test-files-bucket';
import { refreshLiveTabDigest } from '../live-tabs/live-tab-digest';
import { LIVE_TAB_KINDS, liveTabKindOfFrame, liveTabKindOfTab } from '../live-tabs/live-tab-kinds';
import { storedUpdates } from '../live-tabs/live-tab-store';
import { adderKeyFor } from '../adder-key';
import { answerInternal, type InternalRoom } from '../room-internal';
import { RoomLiveTabs } from '../live-tabs/room-live-tabs';
import { PDF_LIVE_TAB } from '../pdf-documents/pdf-live-tab';
import { documentBlobHold, storedPdfTab } from '../pdf-documents/pdf-document-store';
import { createShareLink } from '../db/share';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleBlobStoreRoutes } from './blob-store-routes';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

const PDF = Uint8Array.from(
  new TextEncoder().encode('%PDF-1.7\nthe bytes of a small file\n%%EOF\n'),
);
const QUAD: Quad = [72, 730, 300, 730, 72, 716, 300, 716];

let db: SqliteD1;
let key: BlobKey;

function call(
  method: string,
  path: string,
  owner: string | null = 'ada',
  bytes?: Uint8Array,
  code?: string,
) {
  return handleDocuments(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner,
      ...(bytes ? { rawBody: bytes as unknown as string } : {}),
      headers: {
        'Content-Type': 'application/octet-stream',
        // Every change names the stored file it was made on ("Storage").
        ...(bytes ? { [PDF_STORED_FILE_HEADER]: key } : {}),
        ...(code ? { 'X-Share-Code': code } : {}),
      },
    }),
  );
}

const STATE = '/api/documents/D/pdf-documents/t1/state';
const UPDATES = '/api/documents/D/pdf-documents/t1/updates';

/** One person's change: a highlight on page one, as the update their browser sends. */
/** The guest's adder key on the document, which its own marks carry. */
const GUEST_KEY = await adderKeyFor('D', 'guest');

function highlightUpdate(
  id: string,
  text = 'The quick brown fox',
  authorKey: string | null = GUEST_KEY,
): Uint8Array {
  const doc = PdfLiveChanges.load();
  PdfLiveChanges.setStored(doc, { blob: key, pages: 2 });
  const mark = Mark.highlight({
    ...Mark.keyed(authorKey),
    id,
    page: PageName.ofObject(4),
    quads: [QUAD],
    text,
    colour: '#fff3a3',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
  });
  if (!mark) throw new Error('fixture');
  PdfLiveChanges.addMark(doc, mark);
  return PdfLiveChanges.encode(doc);
}

/** A page turned: a change only Editing makes. */
function turnUpdate(): Uint8Array {
  const doc = PdfLiveChanges.load();
  PdfChange.apply(doc, PdfChange.turnPage(PageName.ofObject(4), 90));
  return PdfLiveChanges.encode(doc);
}

const marksOf = async (res: Response) =>
  PdfLiveChanges.marks(PdfLiveChanges.load([new Uint8Array(await res.arrayBuffer())]));

// A room whose internal door runs the real room side over the test's database.
function withRoom(caps?: { characters: number; stateBytes: number }) {
  const relayed: unknown[] = [];
  const told: unknown[] = [];
  const room = new RoomLiveTabs(PDF_LIVE_TAB, {
    env: db.env,
    enqueue: (step) => step(),
    sequence: (_from, op) => relayed.push(op),
    sendTo: (_ws, payload) => void told.push(payload),
    position: () => ({ epoch: 'e' }),
    ...(caps ? { caps } : {}),
  });
  // The room's own internal endpoint, over the live tab alone.
  const internal = {
    acceptPostedLiveTab: (
      frame: string,
      ...[documentId, tabId, update, sent]: Parameters<RoomLiveTabs['acceptPosted']>
    ) =>
      frame === 'pdf'
        ? room.acceptPosted(documentId, tabId, update, sent)
        : Promise.resolve('wrong-kind' as const),
  } as unknown as InternalRoom;
  const binding = {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        const request = new Request(url, {
          method: init?.method ?? 'GET',
          body: init?.body ?? null,
        });
        return (
          (await answerInternal(internal, request, url)) ?? new Response(null, { status: 500 })
        );
      },
    }),
  };
  (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = binding;
  return { relayed, told, room };
}

beforeEach(async () => {
  db = sqliteD1();
  db.env.FILES = testFilesBucket();
  key = await blobKeyOf(PDF);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  await handleBlobStoreRoutes(
    makeTestRouteContext('PUT', `/api/files/${key}`, {
      env: db.env,
      owner: 'ada',
      rawBody: PDF as unknown as string,
      headers: { 'Content-Length': String(PDF.byteLength) },
    }),
  );
  const tabs = [
    { id: 't1', name: 'Contract', kind: 'pdf', elements: [], blob: key, size: PDF.byteLength },
    { id: 't2', name: 'Notes', kind: 'text-document', elements: [] },
  ];
  const made = await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'ada',
      body: { id: 'D', name: 'Contract', tabs },
    }),
  );
  expect(made.status).toBe(201);
});
afterEach(() => vi.restoreAllMocks());

describe('the PDF document as a live tab kind', () => {
  it('is one of the kinds the room stores, by its tab kind and its frame', () => {
    expect(LIVE_TAB_KINDS).toContain(PDF_LIVE_TAB);
    expect(liveTabKindOfTab({ kind: 'pdf' })).toBe(PDF_LIVE_TAB);
    expect(liveTabKindOfFrame('pdf')).toBe(PDF_LIVE_TAB);
    expect(PDF_LIVE_TAB.tables).toEqual({
      updates: 'pdf_updates',
      chunks: 'pdf_chunks',
      digest: 'pdf_digest',
    });
    // Its live changes are bounded by their bytes, never by characters.
    expect(PDF_LIVE_TAB.state.insertedCharacters(highlightUpdate('m1'))).toBe(0);
  });

  it('reads the stored file a PDF tab names, and none from another kind', async () => {
    expect(await storedPdfTab(db.env, 'D', 't1')).toEqual({ blob: key, size: PDF.byteLength });
    expect(await storedPdfTab(db.env, 'D', 't2')).toBeNull();
    expect(await storedPdfTab(db.env, 'D', 'nope')).toBeNull();
  });
});

describe('reading the live changes', () => {
  // "Empty is the common case": a PDF nobody changed has no state at all.
  it('answers an empty state for a PDF nobody changed, naming its stored file', async () => {
    const res = await call('GET', STATE);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get(PDF_STORED_FILE_HEADER)).toBe(key);
    const doc = PdfLiveChanges.load([new Uint8Array(await res.arrayBuffer())]);
    expect(PdfLiveChanges.isEmpty(doc)).toBe(true);
    expect(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')).toEqual([]);
  });

  it('answers pdf_not_found for a tab that is absent or another kind', async () => {
    for (const tab of ['t2', 'nope']) {
      const res = await call('GET', `/api/documents/D/pdf-documents/${tab}/state`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'pdf_not_found' });
    }
  });

  it('is gated as the document’s content is', async () => {
    expect((await call('GET', STATE, 'mallory')).status).toBe(403);
    expect((await call('GET', '/api/documents/nope/pdf-documents/t1/state')).status).toBe(404);
    expect((await call('GET', STATE, null)).status).toBe(400);
  });

  it('leaves every other path and method to other routes', async () => {
    expect((await call('GET', '/api/documents/D/pdf-documents/t1/file')).status).toBe(404);
    expect((await call('DELETE', STATE)).status).toBe(404);
  });
});

describe('sending a change by the door', () => {
  it('stores an Editor’s update, relays it, and reads it back', async () => {
    const { relayed } = withRoom();
    const res = await call('POST', UPDATES, 'ada', highlightUpdate('m1'));
    expect(res.status).toBe(204);
    expect(relayed).toEqual([{ kind: 'pdf', tabId: 't1', update: expect.any(String) }]);
    const marks = await marksOf(await call('GET', STATE));
    expect(marks.map((mark) => mark.id)).toEqual(['m1']);
  });

  // "Concurrent changes": each adds a mark: both marks.
  it('merges two people’s marks, and answers a catch-up with only what lies beyond', async () => {
    withRoom();
    await call('POST', UPDATES, 'ada', highlightUpdate('m1'));
    const first = await call('GET', STATE);
    const vector = first.headers.get(TEXT_DOCUMENT_STATE_VECTOR_HEADER)!;
    await call('POST', UPDATES, 'ada', highlightUpdate('m2'));
    const whole = await marksOf(await call('GET', STATE));
    expect(whole.map((mark) => mark.id)).toEqual(['m1', 'm2']);
    const beyond = await call('GET', `${STATE}?since=${encodeURIComponent(vector)}`);
    expect(beyond.status).toBe(200);
    const caughtUp = PdfLiveChanges.load([
      new Uint8Array(await first.arrayBuffer()),
      new Uint8Array(await beyond.arrayBuffer()),
    ]);
    expect(PdfLiveChanges.marks(caughtUp).map((mark) => mark.id)).toEqual(['m1', 'm2']);
  });

  it('refuses a state vector that is none', async () => {
    for (const since of ['%%%', base64OfBytes(Uint8Array.of(255, 255, 255))]) {
      const res = await call('GET', `${STATE}?since=${encodeURIComponent(since)}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'state_vector_invalid' });
    }
  });

  it('names an update that is none, and one past the cap', async () => {
    withRoom();
    const invalid = await call('POST', UPDATES, 'ada', Uint8Array.of(9, 9, 9));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'update_invalid' });
    const large = await call('POST', UPDATES, 'ada', new Uint8Array(PDF_UPDATE_MAX_BYTES + 1));
    expect(large.status).toBe(413);
    expect(await large.json()).toEqual({ error: 'update_too_large' });
  });

  // "Limits": live changes past their ceiling are refused whole, and named.
  it('refuses an update that would pass the live changes’ ceiling', async () => {
    withRoom({ characters: Number.MAX_SAFE_INTEGER, stateBytes: 64 });
    const res = await call('POST', UPDATES, 'ada', highlightUpdate('m1'));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'live_changes_too_large', limit: 'state' });
    expect(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')).toEqual([]);
  });

  it('is an edit of the tab: refused for whoever may not edit, and on a tab of another kind', async () => {
    withRoom();
    expect((await call('POST', UPDATES, 'mallory', highlightUpdate('m1'))).status).toBe(403);
    const other = await call(
      'POST',
      '/api/documents/D/pdf-documents/t2/updates',
      'ada',
      highlightUpdate('m1'),
    );
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ error: 'pdf_not_found' });
    expect(
      (
        await call(
          'POST',
          '/api/documents/nope/pdf-documents/t1/updates',
          'ada',
          highlightUpdate('m1'),
        )
      ).status,
    ).toBe(404);
  });

  it('names an update the room itself could not read', async () => {
    (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => new Response(null, { status: 400 }) }),
    };
    const res = await call('POST', UPDATES, 'ada', highlightUpdate('m1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'update_invalid' });
    expect((await call('POST', UPDATES, null, highlightUpdate('m1'))).status).toBe(400);
  });

  it('says so when the room cannot be reached', async () => {
    (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => new Response(null, { status: 500 }) }),
    };
    const res = await call('POST', UPDATES, 'ada', highlightUpdate('m1'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'room_unavailable' });
  });
});

// docs/specs/035-pdf-documents/pdf-document.md "Share roles", editing-modes.md "Share roles": every role reads; the
// room takes an Editor's changes as they are and a Participant's by what they touch
// (live-editing-and-storage.md "The room's op kinds").
describe('share roles', () => {
  beforeEach(async () => {
    await createShareLink(db.env, 'D', 'EDITCODE', 'edit');
    await createShareLink(db.env, 'D', 'PARTCODE', 'participate');
    await createShareLink(db.env, 'D', 'VIEWCODE', 'view');
    await createShareLink(db.env, 'D', 'SCOPED01', 'edit', 'never', 't1');
    await createShareLink(db.env, 'D', 'SCOPED02', 'edit', 'never', 't2');
    withRoom();
  });

  it.each(['EDITCODE', 'PARTCODE', 'VIEWCODE', 'SCOPED01'])(
    'lets a visitor on %s read the live changes and the stored file',
    async (code) => {
      const state = await call('GET', STATE, 'guest', undefined, code);
      expect(state.status).toBe(200);
      const file = await call('GET', `/api/documents/D/files/${key}`, 'guest', undefined, code);
      expect(file.status).toBe(200);
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);
    },
  );

  it.each([
    ['EDITCODE', 204, null],
    ['SCOPED01', 204, null],
    ['PARTCODE', 204, null],
    ['VIEWCODE', 403, 'level_too_low'],
    ['SCOPED02', 404, 'pdf_not_found'],
  ])('answers a change sent on %s with %i', async (code, status, error) => {
    const res = await call('POST', UPDATES, 'guest', highlightUpdate('m1'), code);
    expect(res.status).toBe(status);
    if (error) expect(await res.json()).toEqual({ error });
  });

  it('refuses a Participant’s posted change that asks an Editor, and one the room cannot read', async () => {
    const turned = await call('POST', UPDATES, 'guest', turnUpdate(), 'PARTCODE');
    expect(turned.status).toBe(403);
    expect(await turned.json()).toEqual({ error: 'level_too_low' });
    expect((await call('POST', UPDATES, 'guest', turnUpdate(), 'EDITCODE')).status).toBe(204);
    // A change that follows one the room never stored.
    const doc = PdfLiveChanges.load();
    const sent: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => sent.push(update));
    doc.getMap('marks').set('a', 1);
    doc.getMap('marks').set('b', 2);
    const unreadable = await call('POST', UPDATES, 'guest', sent[1], 'PARTCODE');
    expect(unreadable.status).toBe(409);
    expect(await unreadable.json()).toEqual({ error: 'update_unreadable' });
    expect(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')).toHaveLength(1);
  });

  it('refuses a Participant’s posted mark that is not their own by name', async () => {
    const theirs = await call(
      'POST',
      UPDATES,
      'guest',
      highlightUpdate('m1', 'words', null),
      'PARTCODE',
    );
    expect(theirs.status).toBe(403);
    expect(await theirs.json()).toEqual({ error: 'not_your_mark' });
    expect(console.warn).toHaveBeenCalledWith(
      '[pdf] level-refused document=D tab=t1 level=participate asks=not_your_mark',
    );
    expect(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')).toEqual([]);
  });

  // docs/specs/006-document/blob-store.md "Getting bytes in": a tab-scoped link serves its own tab only.
  it('keeps a tab-scoped link to its own tab: neither another tab’s changes nor its file', async () => {
    expect((await call('GET', STATE, 'guest', undefined, 'SCOPED02')).status).toBe(404);
    const file = await call('GET', `/api/documents/D/files/${key}`, 'guest', undefined, 'SCOPED02');
    expect(file.status).toBe(404);
    expect(await file.json()).toEqual({ error: 'blob_not_held' });
  });

  it('says which tab holds a key, and none for a key no tab names', async () => {
    expect(await documentBlobHold(db.env, 'D', key, null)).toEqual({
      tabId: 't1',
      size: PDF.byteLength,
    });
    expect(await documentBlobHold(db.env, 'D', key, 't2')).toBeNull();
    expect(await documentBlobHold(db.env, 'D', 'e'.repeat(64) as BlobKey, null)).toBeNull();
  });
});

describe('a frame from an Editor’s socket', () => {
  it('is stored before it is relayed, and refused for a tab of another kind', async () => {
    const { room, relayed } = withRoom();
    const ws = {} as WebSocket;
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'edit' as const,
      adderKey: null,
    };
    const frame = (tabId: string) => ({
      kind: 'pdf',
      tabId,
      update: base64OfBytes(highlightUpdate('m1')),
      on: key,
    });
    expect(await room.accept(sender, frame('t1'))).toBe(true);
    expect(relayed).toHaveLength(1);
    expect(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')).toHaveLength(1);
    expect(await room.accept(sender, frame('t2'))).toBe(false);
    expect(relayed).toHaveLength(1);
  });
});

// "The digest": pages from the stored file, never empty, the words under marks its search text.
// live-editing-and-storage.md "The room's op kinds": the room checks what an update touches, not only who sent it.
describe('a frame from a Participant’s or a Viewer’s socket', () => {
  const ws = {} as WebSocket;
  const frame = (update: Uint8Array) => ({
    kind: 'pdf',
    tabId: 't1',
    update: base64OfBytes(update),
    on: key,
  });
  const refusedLevel = {
    kind: 'op',
    from: 'system',
    op: { kind: 'pdf-refused', tabId: 't1', name: 'level_too_low' },
  };

  it('stores and relays a Participant’s mark as an Editor’s', async () => {
    const { room, relayed, told } = withRoom();
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'participate' as const,
      adderKey: GUEST_KEY,
    };
    expect(await room.accept(sender, frame(highlightUpdate('m1')), 3)).toBe(true);
    expect(relayed).toHaveLength(1);
    expect(told).toEqual([{ kind: 'cursor', epoch: 'e', seq: 1, ref: 3 }]);
    expect(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')).toHaveLength(1);
  });

  it('refuses a Participant’s change to another’s mark whole, telling the sender alone by name', async () => {
    const { room, relayed, told } = withRoom();
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'participate' as const,
      adderKey: 'k-bob',
    };
    expect(await room.accept(sender, frame(highlightUpdate('m1')))).toBe(false);
    expect(relayed).toEqual([]);
    expect(told).toEqual([
      {
        kind: 'op',
        from: 'system',
        op: { kind: 'pdf-refused', tabId: 't1', name: 'not_your_mark' },
      },
    ]);
    expect(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')).toEqual([]);
  });

  it('refuses a Participant’s change to a page whole, telling the sender alone', async () => {
    const { room, relayed, told } = withRoom();
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'participate' as const,
      adderKey: GUEST_KEY,
    };
    expect(await room.accept(sender, frame(turnUpdate()))).toBe(false);
    expect(relayed).toEqual([]);
    expect(told).toEqual([refusedLevel]);
    expect(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      '[pdf] level-refused document=D tab=t1 level=participate asks=edit',
    );
  });

  it('refuses a Participant’s change it cannot read yet, untold', async () => {
    const { room, relayed, told } = withRoom();
    const doc = PdfLiveChanges.load();
    const sent: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => sent.push(update));
    doc.getMap('marks').set('a', 1);
    doc.getMap('marks').set('b', 2);
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'participate' as const,
      adderKey: GUEST_KEY,
    };
    expect(await room.accept(sender, frame(sent[1]!))).toBe(false);
    expect(relayed).toEqual([]);
    expect(told).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      '[pdf] update-refused document=D tab=t1 reason=unreadable',
    );
  });

  it('refuses a Viewer’s change without reading it', async () => {
    const { room, relayed, told } = withRoom();
    const asks = vi.spyOn(PDF_LIVE_TAB.state, 'asks');
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'view' as const,
      adderKey: null,
    };
    expect(await room.accept(sender, frame(highlightUpdate('m1')))).toBe(false);
    expect(relayed).toEqual([]);
    expect(told).toEqual([refusedLevel]);
    expect(asks).not.toHaveBeenCalled();
    expect(
      await room.acceptPosted('D', 't1', highlightUpdate('m1'), { level: 'view', on: key }),
    ).toBe('level');
  });

  it('never reads what an Editor’s change touches', async () => {
    const { room } = withRoom();
    const asks = vi.spyOn(PDF_LIVE_TAB.state, 'asks');
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'edit' as const,
      adderKey: null,
    };
    expect(await room.accept(sender, frame(turnUpdate()))).toBe(true);
    expect(asks).not.toHaveBeenCalled();
  });

  it('lets no Participant name a stored file for a tab that names none', () => {
    const named = PdfLiveChanges.load();
    PdfLiveChanges.setStored(named, { blob: key, pages: 2 });
    expect(
      PDF_LIVE_TAB.state.asks!(
        [],
        PdfLiveChanges.encode(named),
        { kind: 'pdf' },
        { adderKey: null },
      ),
    ).toBe('edit');
  });

  it('holds a Participant to the stored file the tab names', async () => {
    const { room } = withRoom();
    const other = PdfLiveChanges.load();
    PdfLiveChanges.setStored(other, { blob: 'e'.repeat(64) as BlobKey, pages: 2 });
    const sender = {
      ws,
      presenceId: 'p1',
      documentId: 'D',
      level: 'participate' as const,
      adderKey: GUEST_KEY,
    };
    expect(await room.accept(sender, frame(PdfLiveChanges.encode(other)))).toBe(false);
  });
});

// blob-store.md "Getting bytes out": a document holds the pictures its marks name (a custom stamp's), and serves them.
describe('a custom stamp’s picture', () => {
  const PICTURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  async function placed(pictureKey: BlobKey): Promise<Uint8Array> {
    const doc = PdfLiveChanges.load();
    PdfLiveChanges.setStored(doc, { blob: key, pages: 2 });
    PdfLiveChanges.addMark(
      doc,
      Mark.stamp({
        ...Mark.keyed(GUEST_KEY),
        id: 'paid',
        page: PageName.ofObject(4),
        rect: [100, 300, 200, 350],
        stamp: 'custom-0b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a',
        lines: ['Paid'],
        picture: { key: pictureKey, type: 'png', width: 4, height: 2 },
        colour: '#000000',
        opacity: 1,
        author: 'Ada',
        createdAt: 1_795_000_000_000,
      })!,
    );
    return PdfLiveChanges.encode(doc);
  }

  it('is held by the document once a mark names it, and served by its key', async () => {
    withRoom();
    const pictureKey = await blobKeyOf(PICTURE);
    await handleBlobStoreRoutes(
      makeTestRouteContext('PUT', `/api/files/${pictureKey}?document=D`, {
        env: db.env,
        owner: 'ada',
        rawBody: PICTURE as unknown as string,
        headers: { 'Content-Length': String(PICTURE.byteLength) },
      }),
    );
    expect(await documentBlobHold(db.env, 'D', pictureKey, null)).toBeNull();
    expect((await call('POST', UPDATES, 'ada', await placed(pictureKey))).status).toBe(204);
    expect(await documentBlobHold(db.env, 'D', pictureKey, null)).toEqual({
      tabId: 't1',
      size: PICTURE.byteLength,
    });
    expect(await documentBlobHold(db.env, 'D', pictureKey, 't2')).toBeNull();
    const served = await call('GET', `/api/documents/D/files/${pictureKey}`);
    expect(served.status).toBe(200);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PICTURE);
    // The digest names it, so the tab holds it for the retention sweep.
    const digest = await refreshLiveTabDigest(db.env, PDF_LIVE_TAB, 'D', 't1');
    expect(digest.blobKeys).toEqual([pictureKey]);
  });

  it('is not held where the document’s owner does not hold its bytes', async () => {
    withRoom();
    const pictureKey = await blobKeyOf(PICTURE);
    expect((await call('POST', UPDATES, 'ada', await placed(pictureKey))).status).toBe(204);
    expect(await documentBlobHold(db.env, 'D', pictureKey, null)).toBeNull();
  });
});

describe('the digest', () => {
  it('counts the stored file’s pages and never reads as empty', async () => {
    withRoom();
    await call('POST', UPDATES, 'ada', highlightUpdate('m1', 'indemnify the supplier'));
    const digest = await refreshLiveTabDigest(db.env, PDF_LIVE_TAB, 'D', 't1');
    expect(digest).toMatchObject({ pages: 2, hasContent: true });
    expect(digest.searchText).toBe('indemnify the supplier');
  });
});

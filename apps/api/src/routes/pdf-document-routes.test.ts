// docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage", "The digest"; the room's side is every live tab
// kind's (docs/specs/006-document/kinds-outside-the-canvas.md "Live state").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_STORED_FILE_HEADER, TEXT_DOCUMENT_STATE_VECTOR_HEADER } from '@livedoc/api-schema';
import { blobKeyOf, type BlobKey } from '@livedoc/document';
import {
  Mark,
  PageName,
  PDF_UPDATE_MAX_BYTES,
  PdfLiveChanges,
  type Quad,
} from '@livedoc/pdf-documents';
import { base64OfBytes } from '@livedoc/text-documents';
import { testFilesBucket } from '../blob-store/test-files-bucket';
import { refreshLiveTabDigest } from '../live-tabs/live-tab-digest';
import { LIVE_TAB_KINDS, liveTabKindOfFrame, liveTabKindOfTab } from '../live-tabs/live-tab-kinds';
import { storedUpdates } from '../live-tabs/live-tab-store';
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
        ...(code ? { 'X-Share-Code': code } : {}),
      },
    }),
  );
}

const STATE = '/api/documents/D/pdf-documents/t1/state';
const UPDATES = '/api/documents/D/pdf-documents/t1/updates';

/** One person's change: a highlight on page one, as the update their browser sends. */
function highlightUpdate(id: string, text = 'The quick brown fox'): Uint8Array {
  const doc = PdfLiveChanges.load();
  PdfLiveChanges.setStored(doc, { blob: key, pages: 2 });
  const mark = Mark.highlight({
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

const marksOf = async (res: Response) =>
  PdfLiveChanges.marks(PdfLiveChanges.load([new Uint8Array(await res.arrayBuffer())]));

// A room whose internal door runs the real room side over the test's database.
function withRoom(caps?: { characters: number; stateBytes: number }) {
  const relayed: unknown[] = [];
  const room = new RoomLiveTabs(PDF_LIVE_TAB, {
    env: db.env,
    enqueue: (step) => step(),
    sequence: (_from, op) => relayed.push(op),
    sendTo: () => {},
    position: () => ({ epoch: 'e' }),
    ...(caps ? { caps } : {}),
  });
  const statuses: Record<string, number> = { stored: 204, decode: 400, 'wrong-kind': 404 };
  const binding = {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        if (url.pathname !== '/live-tab-update' || url.searchParams.get('frame') !== 'pdf')
          return new Response(null, { status: 500 });
        const outcome = await room.acceptPosted(
          url.searchParams.get('document')!,
          url.searchParams.get('tab')!,
          new Uint8Array(init!.body as ArrayBuffer),
        );
        if (outcome === 'characters' || outcome === 'state')
          return Response.json({ limit: outcome }, { status: 413 });
        return new Response(null, { status: statuses[outcome] ?? 503 });
      },
    }),
  };
  (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = binding;
  return { relayed, room };
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
// room takes changes from Editors alone until a Participant's frames are checked by what they touch.
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
    ['PARTCODE', 403, 'level_too_low'],
    ['VIEWCODE', 403, 'level_too_low'],
    ['SCOPED02', 404, 'pdf_not_found'],
  ])('answers a change sent on %s with %i', async (code, status, error) => {
    const res = await call('POST', UPDATES, 'guest', highlightUpdate('m1'), code);
    expect(res.status).toBe(status);
    if (error) expect(await res.json()).toEqual({ error });
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
    const sender = { ws, presenceId: 'p1', documentId: 'D' };
    const frame = (tabId: string) => ({
      kind: 'pdf',
      tabId,
      update: base64OfBytes(highlightUpdate('m1')),
    });
    expect(await room.accept(sender, frame('t1'))).toBe(true);
    expect(relayed).toHaveLength(1);
    expect(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')).toHaveLength(1);
    expect(await room.accept(sender, frame('t2'))).toBe(false);
    expect(relayed).toHaveLength(1);
  });
});

// "The digest": pages from the stored file, never empty, the words under marks its search text.
describe('the digest', () => {
  it('counts the stored file’s pages and never reads as empty', async () => {
    withRoom();
    await call('POST', UPDATES, 'ada', highlightUpdate('m1', 'indemnify the supplier'));
    const digest = await refreshLiveTabDigest(db.env, PDF_LIVE_TAB, 'D', 't1');
    expect(digest).toMatchObject({ pages: 2, hasContent: true });
    expect(digest.searchText).toBe('indemnify the supplier');
  });
});

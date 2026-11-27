import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64OfBytes, LiveThreads, TextDocumentState, ViewerCopy } from '@livedoc/text-documents';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { createShareLink } from '../db/share';
import { appendLiveTabUpdate, storedUpdates } from '../live-tabs/live-tab-store';
import { answerInternal, type InternalRoom } from '../room-internal';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { RoomViewerCopies } from '../text-documents/room-viewer-copies';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

// docs/specs/034-text-documents/review.md "What a Viewer receives"; live-editing-and-storage.md "A Viewer's copy": the
// state and file doors answer a Viewer from a copy without comments or authors, everyone else from the document.

const ADA = { key: 'key-ada-77', name: 'Ada Secretname', colour: '#1a73e8' };
const SECRET = 'Confidential remark';
const LEAKS = [SECRET, ADA.name, ADA.key];
const latin1 = (bytes: ArrayBuffer) => new TextDecoder('latin1').decode(new Uint8Array(bytes));
const STATE = '/api/documents/D/text-documents/t1/state';

let db: SqliteD1;
let room: { reachable: boolean };

function get(path: string, code?: string) {
  return handleDocuments(
    makeTestRouteContext('GET', path, {
      env: db.env,
      owner: code ? 'visitor' : 'owner',
      ...(code ? { headers: { 'X-Share-Code': code } } : {}),
    }),
  );
}

beforeEach(async () => {
  db = sqliteD1();
  await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'owner',
      body: {
        id: 'D',
        name: 'Report',
        tabs: [{ id: 't1', name: 'T', kind: 'text-document', format: 'odf', elements: [] }],
      },
    }),
  );
  const doc = TextDocumentState.load();
  TextDocumentState.replaceBody(doc, [{ text: 'Quarterly results' }]);
  const run = (
    TextDocumentState.body(doc).get(0) as unknown as {
      get: (i: number) => { format: (at: number, length: number, attributes: object) => void };
    }
  ).get(0);
  run.format(0, 9, { insertion: { id: 's1', at: 1, author: ADA } });
  LiveThreads.begin(
    doc,
    {
      id: 'thread-1',
      tab: 't.0',
      ...LiveThreads.anchorFor(run as never, 0, 9),
      quote: 'Quarterly',
      comment: { id: 'c1', text: SECRET, at: 1, author: ADA },
    },
    'test',
  );
  await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', TextDocumentState.encode(doc));
  await createShareLink(db.env, 'D', 'VIEWCODE', 'view');
  await createShareLink(db.env, 'D', 'PARTCODE', 'participate');
  // The room the doors reach: its internal endpoint over a real keeper on the same store.
  const copies = new RoomViewerCopies({
    env: db.env,
    storedUpdates: (tabId) => storedUpdates(db.env, TEXT_DOCUMENT_LIVE_TAB, tabId),
    hasViewers: () => true,
    closeViewers: () => 0,
  });
  const internal = {
    readViewerCopy: (place, since) => copies.state(place, since),
  } as Pick<InternalRoom, 'readViewerCopy'> as InternalRoom;
  room = { reachable: true };
  (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (input: string, init?: RequestInit) => {
        if (!room.reachable) throw new Error('gone');
        return (
          (await answerInternal(internal, new Request(input, init), new URL(input))) ??
          new Response(null, { status: 404 })
        );
      },
    }),
  };
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('the state door, for a Viewer', () => {
  it('answers a Viewer from the copy, a Participant and the owner from the document', async () => {
    const viewer = await get(STATE, 'VIEWCODE');
    expect(viewer.status).toBe(200);
    expect(viewer.headers.get('X-Viewer-Copy')).toMatch(/^[0-9a-f-]{36}$/);
    const copy = latin1(await viewer.arrayBuffer());
    expect(copy).toContain('Quarterly');
    expect(copy).toContain('results');
    for (const leak of LEAKS) expect(copy, leak).not.toContain(leak);
    // The level a request is granted now decides: a Viewer raised to Participant reads the document.
    for (const res of [await get(STATE, 'PARTCODE'), await get(STATE)]) {
      expect(res.headers.get('X-Viewer-Copy')).toBeNull();
      expect(latin1(await res.arrayBuffer())).toContain(SECRET);
    }
  });

  it('answers a catch-up from the same copy, refuses one from another, and a vector that is none', async () => {
    const first = await get(STATE, 'VIEWCODE');
    const copy = first.headers.get('X-Viewer-Copy')!;
    const vector = encodeURIComponent(first.headers.get('X-State-Vector')!);
    const same = await get(`${STATE}?since=${vector}&copy=${copy}`, 'VIEWCODE');
    expect(same.status).toBe(200);
    const other = await get(`${STATE}?since=${vector}&copy=another`, 'VIEWCODE');
    expect(other.status).toBe(409);
    expect(await other.json()).toEqual({ error: 'viewer_copy_changed' });
    const none = await get(`${STATE}?since=${vector}`, 'VIEWCODE');
    expect(none.status).toBe(409);
    // A reader whose vector rides no URL names its copy alone, and reads it whole.
    expect((await get(`${STATE}?copy=${copy}`, 'VIEWCODE')).status).toBe(200);
    expect((await get(`${STATE}?copy=another`, 'VIEWCODE')).status).toBe(409);
    const bad = await get(
      `${STATE}?since=${encodeURIComponent(base64OfBytes(Uint8Array.of(9, 9, 9)))}`,
      'VIEWCODE',
    );
    expect(bad.status).toBe(400);
  });

  it('says unavailable when the copy cannot be made, and when the room cannot be reached', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(ViewerCopy, 'build').mockImplementationOnce(() => {
      throw new Error('broken');
    });
    const failed = await get(STATE, 'VIEWCODE');
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: 'viewer_copy_unavailable' });
    room.reachable = false;
    const gone = await get(STATE, 'VIEWCODE');
    expect(gone.status).toBe(503);
    expect(await gone.json()).toEqual({ error: 'room_unavailable' });
  });
});

describe('the file door, for a Viewer', () => {
  const FILE = '/api/documents/D/text-documents/t1/file?type=fodt';

  it('writes a Viewer’s file without comments or authors, the owner’s with them', async () => {
    const viewer = await get(FILE, 'VIEWCODE');
    expect(viewer.status).toBe(200);
    const file = latin1(await viewer.arrayBuffer());
    expect(file).toContain('Quarterly');
    for (const leak of LEAKS) expect(file, leak).not.toContain(leak);
    const owners = latin1(await (await get(FILE)).arrayBuffer());
    expect(owners).toContain(SECRET);
    expect(owners).toContain(ADA.name);
  });

  it('says unavailable when the copy cannot be made, never the document', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(ViewerCopy, 'redacted').mockImplementationOnce(() => {
      throw new Error('broken');
    });
    const res = await get(FILE, 'VIEWCODE');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'viewer_copy_unavailable' });
  });
});

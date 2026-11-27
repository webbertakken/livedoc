import { beforeEach, describe, expect, it } from 'vitest';
import { Body, TextDocumentState } from '@livedoc/text-documents';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { createShareLink } from '../db/share';
import { appendLiveTabUpdate, storedUpdates } from '../live-tabs/live-tab-store';
import { answerInternal, type InternalRoom } from '../room-internal';
import { RoomTextDocumentVersions } from '../text-documents/room-text-document-versions';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { applyTextDocumentVersionWrite } from '../text-documents/text-document-version-write';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

// docs/specs/034-text-documents/live-editing-and-storage.md "The api"; review.md "Version history" (Editors only).

let db: SqliteD1;
let versions: RoomTextDocumentVersions;

const BASE = '/api/documents/D/text-documents/t1/versions';

function call(method: string, path: string, body?: unknown, code?: string, owner = 'owner') {
  return handleDocuments(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner,
      ...(body === undefined ? {} : { body }),
      ...(code ? { headers: { 'X-Share-Code': code } } : {}),
    }),
  );
}

// The room the routes reach: its internal endpoint over a real keeper on the same store.
function withRoom() {
  const room = {
    writeTextDocumentVersion: (write) => applyTextDocumentVersionWrite(versions, write),
  } as Pick<InternalRoom, 'writeTextDocumentVersion'> as InternalRoom;
  (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (input: string, init?: RequestInit) =>
        (await answerInternal(room, new Request(input, init), new URL(input))) ??
        new Response(null, { status: 404 }),
    }),
  };
}

type VersionBody = { version: { id: string; name: string | null; takenBy: unknown } };

// The version a name or restore answers.
const written = async (res: Response | Promise<Response>) =>
  (await (await res).json<VersionBody>()).version;

async function type(text: string) {
  const update = TextDocumentState.fromBody(Body.of(text));
  await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', update);
  await versions.stored({ documentId: 'D', tabId: 't1' }, update, {
    key: 'k',
    name: 'Ada',
    color: '#1a73e8',
  });
}

beforeEach(async () => {
  db = sqliteD1();
  await call('POST', '/api/documents', {
    id: 'D',
    name: 'Report',
    tabs: [
      { id: 't1', name: 'T', kind: 'text-document', format: 'odf', elements: [] },
      { id: 'c', name: 'C', elements: [] },
    ],
  });
  versions = new RoomTextDocumentVersions({
    env: db.env,
    storedUpdates: (tabId) => storedUpdates(db.env, TEXT_DOCUMENT_LIVE_TAB, tabId),
    storeUpdate: async (place, update) => {
      await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, place.tabId, update);
    },
    caps: undefined,
  });
  withRoom();
});

describe('text document version routes', () => {
  it('lists none, then names the current version and lists it', async () => {
    expect(await (await call('GET', BASE)).json()).toEqual({ versions: [] });
    await type('Draft');
    const named = await call('POST', BASE, {
      name: ' First draft ',
      author: { name: 'Ada', color: '#1a73e8' },
    });
    expect(named.status).toBe(200);
    const version = await written(named);
    expect(version).toMatchObject({
      name: 'First draft',
      takenBy: { name: 'Ada', color: '#1a73e8' },
    });
    const list = await (await call('GET', BASE)).json<{ versions: { id: string }[] }>();
    expect(list.versions.map((v) => v.id)).toEqual([version.id]);
  });

  it('reads one version whole, with the one before it and who wrote with each client', async () => {
    await type('Draft');
    const version = await written(call('POST', BASE, { name: 'A' }));
    const res = await call('GET', `${BASE}/${version.id}`);
    expect(res.status).toBe(200);
    const read = await res.json<{ snapshot: string; previous: string; clients: object }>();
    expect(read.snapshot.length).toBeGreaterThan(0);
    expect(read.previous.length).toBeGreaterThan(0);
    expect(Object.values(read.clients)).toContainEqual({ key: 'k', name: 'Ada', color: '#1a73e8' });
    expect((await call('GET', `${BASE}/nope`)).status).toBe(404);
  });

  it('renames and unnames a version', async () => {
    await type('Draft');
    const version = await written(call('POST', BASE, { name: 'A' }));
    const renamed = await call('PUT', `${BASE}/${version.id}`, { name: 'B' });
    expect(await renamed.json()).toMatchObject({ version: { name: 'B', kind: 'named' } });
    const unnamed = await call('PUT', `${BASE}/${version.id}`, { name: '' });
    expect(await unnamed.json()).toMatchObject({ version: { name: null, kind: 'automatic' } });
  });

  it('refuses a name too long, none for the current version, and a body without one', async () => {
    await type('Draft');
    expect(await (await call('POST', BASE, { name: 'x'.repeat(101) })).json()).toEqual({
      error: 'version_name_too_long',
    });
    expect((await call('POST', BASE, { name: '  ' })).status).toBe(400);
    expect(await (await call('POST', BASE, {})).json()).toEqual({ error: 'version_name_invalid' });
  });

  it('restores a version', async () => {
    await type('Original');
    const version = await written(call('POST', BASE, { name: 'O' }));
    await type('Changed');
    const res = await call('POST', `${BASE}/${version.id}`, { author: { name: 'Ada' } });
    expect(await res.json()).toMatchObject({ version: { restoredFrom: version.id } });
    const state = TextDocumentState.load(await storedUpdates(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1'));
    expect(TextDocumentState.paragraphs(state).map((p) => p.text)).toContain('Original');
    expect((await call('POST', `${BASE}/nope`, {})).status).toBe(404);
  });

  it('answers a tab that is no text document as not found', async () => {
    expect(await (await call('GET', '/api/documents/D/text-documents/c/versions')).json()).toEqual({
      error: 'text_document_not_found',
    });
  });

  describe('share roles', () => {
    beforeEach(async () => {
      await createShareLink(db.env, 'D', 'EDITCODE', 'edit');
      await createShareLink(db.env, 'D', 'PARTCODE', 'participate');
      await createShareLink(db.env, 'D', 'VIEWCODE', 'view');
      await createShareLink(db.env, 'D', 'SCOPED02', 'edit', 'never', 'c');
    });

    it.each([
      ['EDITCODE', 200],
      ['PARTCODE', 403],
      ['VIEWCODE', 403],
      ['SCOPED02', 404],
    ])('answers a visitor on %s with %i', async (code, status) => {
      expect((await call('GET', BASE, undefined, code, 'guest')).status).toBe(status);
      if (status !== 200)
        expect((await call('POST', BASE, { name: 'X' }, code, 'guest')).status).toBe(status);
    });
  });
});

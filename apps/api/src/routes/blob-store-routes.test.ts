// docs/specs/006-document/blob-store.md: "Getting bytes in", "Getting bytes out", "Without object storage",
// "Refusals"; docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage" (a tab names only bytes held).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf, FILE_TAB_MAX_BYTES, type BlobKey } from '@livedoc/document';
import { testFilesBucket, type TestFilesBucket } from '../blob-store/test-files-bucket';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { migrateOwnerId } from '../db';
import { handleBlobStoreRoutes } from './blob-store-routes';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

const PDF = Uint8Array.from(
  new TextEncoder().encode('%PDF-1.7\nthe bytes of a small file\n%%EOF\n'),
);

let db: SqliteD1;
let bucket: TestFilesBucket;
let key: BlobKey;

beforeEach(async () => {
  db = sqliteD1();
  bucket = testFilesBucket();
  db.env.FILES = bucket;
  key = await blobKeyOf(PDF);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

type Sent = { owner?: string | null; bytes?: Uint8Array; headers?: Record<string, string> };

function files(method: string, path: string, sent: Sent = {}) {
  const bytes = sent.bytes;
  return handleBlobStoreRoutes(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner: sent.owner === undefined ? 'ada' : sent.owner,
      ...(bytes ? { rawBody: bytes as unknown as string } : {}),
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(bytes ? { 'Content-Length': String(bytes.byteLength) } : {}),
        ...sent.headers,
      },
    }),
  );
}

function documents(method: string, path: string, sent: Sent & { body?: unknown } = {}) {
  return handleDocuments(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner: sent.owner === undefined ? 'ada' : sent.owner,
      ...(sent.body ? { body: sent.body } : {}),
      ...(sent.headers ? { headers: sent.headers } : {}),
    }),
  );
}

const pdfTab = (blob: string = key, size = PDF.byteLength) => ({
  id: 't1',
  name: 'Contract',
  kind: 'pdf',
  elements: [],
  blob,
  size,
});
const create = (tabs: unknown[] = [pdfTab()], owner = 'ada') =>
  documents('POST', '/api/documents', { owner, body: { id: 'D', name: 'Contract', tabs } });

describe('getting bytes in', () => {
  it('stores a file in one request, under the owner and the key', async () => {
    const res = await files('PUT', `/api/files/${key}`, { bytes: PDF });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ stored: true });
    expect(bucket.objects.size).toBe(1);
    expect(bucket.blob('ada', key)).toEqual(PDF);
  });

  // "An upload begins by asking": bytes already held for that owner are never sent again.
  it('answers what the owner already holds, and never reads those bytes again', async () => {
    const wanted = await files('GET', `/api/files/${key}`);
    expect(wanted.status).toBe(200);
    expect(await wanted.json()).toEqual({ held: false });
    await files('PUT', `/api/files/${key}`, { bytes: PDF });
    const held = await files('GET', `/api/files/${key}`);
    expect(held.status).toBe(200);
    expect(await held.json()).toEqual({ held: true });
    const put = vi.spyOn(bucket, 'put');
    const again = await files('PUT', `/api/files/${key}`, { bytes: PDF });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ held: true });
    expect(put).not.toHaveBeenCalled();
    // Another owner's equal file is their own object: one person's key never tells another a file exists.
    expect(await (await files('GET', `/api/files/${key}`, { owner: 'grace' })).json()).toEqual({
      held: false,
    });
  });

  it('refuses a key that is no SHA-256 in lower-case hex', async () => {
    for (const bad of ['abc', key.toUpperCase(), `${key}0`]) {
      const res = await files('PUT', `/api/files/${bad}`, { bytes: PDF });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'key_invalid' });
    }
  });

  it('refuses bytes that do not hash to their key, keeping nothing', async () => {
    const other = await blobKeyOf(Uint8Array.of(1, 2, 3));
    const res = await files('PUT', `/api/files/${other}`, { bytes: PDF });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'key_mismatch' });
    expect(bucket.objects.size).toBe(0);
  });

  // "Limits": one byte more than FILE_TAB_MAX_BYTES is refused before any byte travels.
  it('refuses a file past the cap by its declared size, before reading it', async () => {
    const put = vi.spyOn(bucket, 'put');
    const res = await files('PUT', `/api/files/${key}`, {
      bytes: PDF,
      headers: { 'Content-Length': String(FILE_TAB_MAX_BYTES + 1) },
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'file_too_large', limitBytes: FILE_TAB_MAX_BYTES });
    expect(put).not.toHaveBeenCalled();
    const atCap = await files('PUT', `/api/files/${key}`, {
      bytes: PDF,
      headers: { 'Content-Length': String(FILE_TAB_MAX_BYTES) },
    });
    expect(atCap.status).toBe(201);
  });

  it('refuses an upload that does not say how many bytes it sends', async () => {
    for (const length of ['0', '-4', 'many', '1.5']) {
      const res = await files('PUT', `/api/files/${key}`, {
        bytes: PDF,
        headers: { 'Content-Length': length },
      });
      expect(res.status).toBe(411);
      expect(await res.json()).toEqual({ error: 'length_required' });
    }
    const bodiless = await files('PUT', `/api/files/${key}`, {
      headers: { 'Content-Length': '9' },
    });
    expect(bodiless.status).toBe(411);
    expect((await files('PUT', `/api/files/${key}`)).status).toBe(411);
  });

  it('names a failure of object storage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bucket.failPuts = true;
    const res = await files('PUT', `/api/files/${key}`, { bytes: PDF });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'store_failed' });
  });

  it('asks who is uploading, and answers only its two methods', async () => {
    expect((await files('PUT', `/api/files/${key}`, { bytes: PDF, owner: null })).status).toBe(400);
    expect((await files('DELETE', `/api/files/${key}`)).status).toBe(404);
    expect((await files('PUT', '/api/files')).status).toBe(404);
  });

  // "An upload names the document it is for and asks edit access to it"; the bytes are the document owner's.
  it('stores an upload naming a document for that document’s owner, for whoever may edit it', async () => {
    await files('PUT', `/api/files/${key}`, { bytes: PDF });
    expect((await create()).status).toBe(201);
    const next = Uint8Array.from(new TextEncoder().encode('%PDF-1.7\nanother file\n%%EOF\n'));
    const nextKey = await blobKeyOf(next);
    const stranger = await files('PUT', `/api/files/${nextKey}?document=D`, {
      bytes: next,
      owner: 'mallory',
    });
    expect(stranger.status).toBe(403);
    expect(
      (await files('GET', `/api/files/${nextKey}?document=D`, { owner: 'mallory' })).status,
    ).toBe(403);
    const owner = await files('PUT', `/api/files/${nextKey}?document=D`, { bytes: next });
    expect(owner.status).toBe(201);
    expect(bucket.blob('ada', nextKey)).toEqual(next);
    const missing = await files('PUT', `/api/files/${nextKey}?document=nope`, { bytes: next });
    expect(missing.status).toBe(404);
  });
});

describe('a tab naming a blob', () => {
  it('makes a PDF document once its bytes are held', async () => {
    await files('PUT', `/api/files/${key}`, { bytes: PDF });
    expect((await create()).status).toBe(201);
  });

  it('refuses a create whose PDF tab names bytes the owner does not hold', async () => {
    const res = await create();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'blob_missing' });
    // Held by someone else is not held.
    await files('PUT', `/api/files/${key}`, { bytes: PDF, owner: 'grace' });
    expect((await create()).status).toBe(409);
  });

  it('refuses a tab naming another size than the bytes held', async () => {
    await files('PUT', `/api/files/${key}`, { bytes: PDF });
    const res = await create([pdfTab(key, PDF.byteLength + 1)]);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'blob_missing' });
  });

  it('refuses a save that turns a tab to bytes not held', async () => {
    await files('PUT', `/api/files/${key}`, { bytes: PDF });
    await create();
    const other = 'c'.repeat(64);
    const res = await documents('PUT', '/api/documents/D/tabs/t1', { body: pdfTab(other) });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'blob_missing' });
    const kept = await documents('PUT', '/api/documents/D/tabs/t1', {
      body: { ...pdfTab(), name: 'Signed contract' },
    });
    expect(kept.status).toBe(200);
  });

  it('asks nothing of a tab of another kind', async () => {
    const res = await create([{ id: 't1', name: 'Board', elements: [] }]);
    expect(res.status).toBe(201);
  });
});

describe('getting bytes out', () => {
  const read = (path: string, sent: Sent = {}) => documents('GET', path, sent);

  beforeEach(async () => {
    await files('PUT', `/api/files/${key}`, { bytes: PDF });
    await create();
  });

  it('streams a blob the document holds, immutable and never as a type a browser would run', async () => {
    const res = await read(`/api/documents/D/files/${key}`);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(res.headers.get('ETag')).toBe(`"${key}"`);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toBe('attachment');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Length')).toBe(String(PDF.byteLength));
  });

  it('answers a range with exactly the bytes asked for', async () => {
    const res = await read(`/api/documents/D/files/${key}`, { headers: { Range: 'bytes=1-3' } });
    expect(res.status).toBe(206);
    expect(await res.text()).toBe('PDF');
    expect(res.headers.get('Content-Range')).toBe(`bytes 1-3/${PDF.byteLength}`);
    expect(res.headers.get('Content-Length')).toBe('3');
    const tail = await read(`/api/documents/D/files/${key}`, { headers: { Range: 'bytes=-6' } });
    expect(await tail.text()).toBe('%%EOF\n');
  });

  it('refuses a range past the blob’s end', async () => {
    const res = await read(`/api/documents/D/files/${key}`, {
      headers: { Range: `bytes=${PDF.byteLength}-` },
    });
    expect(res.status).toBe(416);
    expect(await res.json()).toEqual({ error: 'range_not_satisfiable' });
    expect(res.headers.get('Content-Range')).toBe(`bytes */${PDF.byteLength}`);
  });

  it('answers a reader that already has the blob without its bytes', async () => {
    const res = await read(`/api/documents/D/files/${key}`, {
      headers: { 'If-None-Match': `"${key}"` },
    });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe('');
  });

  // "A key the document does not hold answers 404 blob_not_held, whoever asks, so a key alone opens nothing."
  it('opens nothing by a key alone', async () => {
    const other = Uint8Array.from(new TextEncoder().encode('%PDF-1.7\nsomeone else\n%%EOF\n'));
    const otherKey = await blobKeyOf(other);
    await files('PUT', `/api/files/${otherKey}`, { bytes: other });
    const res = await read(`/api/documents/D/files/${otherKey}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'blob_not_held' });
    expect((await read('/api/documents/D/files/not-a-key')).status).toBe(400);
  });

  it('is gated as the document’s content is', async () => {
    expect((await read(`/api/documents/D/files/${key}`, { owner: 'mallory' })).status).toBe(403);
    expect((await read(`/api/documents/nope/files/${key}`)).status).toBe(404);
    expect((await read(`/api/documents/D/files/${key}`, { owner: null })).status).toBe(400);
  });

  // docs/specs/035-pdf-documents/opening.md "Refusals": the stored file's bytes are gone from the store.
  it('names bytes a tab holds that the store has lost', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bucket.objects.clear();
    const res = await read(`/api/documents/D/files/${key}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'blob_missing' });
  });

  it('names bytes a tab holds whose row has gone from what the owner holds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.sql.prepare('DELETE FROM blobs').run();
    const res = await read(`/api/documents/D/files/${key}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'blob_missing' });
  });

  // "A guest's blobs are the account's after signing up, read under the same documents."
  it('reads a guest’s file under the account they signed up to, no byte moved', async () => {
    const before = [...bucket.objects.keys()];
    await migrateOwnerId(db.env, 'ada', 'account-1');
    const res = await documents('GET', `/api/documents/D/files/${key}`, { owner: 'account-1' });
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect([...bucket.objects.keys()]).toEqual(before);
  });
});

// "Without object storage": every route answers 503 files_unavailable, and no PDF document can be made.
describe('without the bucket', () => {
  beforeEach(() => {
    delete db.env.FILES;
  });

  it('answers every route files_unavailable', async () => {
    const board = { id: 'D', name: 'Board', tabs: [{ id: 't0', name: 'Board', elements: [] }] };
    expect((await documents('POST', '/api/documents', { body: board })).status).toBe(201);
    for (const res of [
      await files('PUT', `/api/files/${key}`, { bytes: PDF }),
      await documents('GET', `/api/documents/D/files/${key}`),
      await documents('PUT', '/api/documents/D/tabs/t1', { body: pdfTab() }),
    ]) {
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'files_unavailable' });
    }
    expect((await files('GET', `/api/files/${key}`)).status).toBe(503);
    expect((await files('GET', '/api/files')).status).toBe(503);
    expect((await files('POST', `/api/files/${key}/uploads?size=9`)).status).toBe(503);
  });
});

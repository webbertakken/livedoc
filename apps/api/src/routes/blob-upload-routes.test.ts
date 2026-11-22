// docs/specs/006-document/blob-store.md "Getting bytes in" (in parts, resuming, usage and the allowance),
// "Where the bytes live" (what an owner holds is a row), "Refusals".
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf, FILE_PART_BYTES, FILE_TAB_MAX_BYTES, type BlobKey } from '@livedoc/document';
import { testFilesBucket, type TestFilesBucket } from '../blob-store/test-files-bucket';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleBlobStoreRoutes } from './blob-store-routes';
import { makeTestRouteContext } from './test-route-context';

// Two whole parts and a last one of five bytes.
const FILE = new Uint8Array(FILE_PART_BYTES * 2 + 5).map((_, at) => (at * 31 + (at >> 13)) % 251);
const PARTS = [
  FILE.subarray(0, FILE_PART_BYTES),
  FILE.subarray(FILE_PART_BYTES, FILE_PART_BYTES * 2),
  FILE.subarray(FILE_PART_BYTES * 2),
];
// Compared by hash, which the key is: an equality that walks 16 MiB an element at a time takes a second.
const isFile = (bytes: Uint8Array | undefined): boolean =>
  bytes !== undefined && createHash('sha256').update(bytes).digest('hex') === key;
const SMALL = Uint8Array.from(new TextEncoder().encode('%PDF-1.7\na small file\n%%EOF\n'));

let db: SqliteD1;
let bucket: TestFilesBucket;
let key: BlobKey;

beforeEach(async () => {
  db = sqliteD1();
  bucket = testFilesBucket();
  db.env.FILES = bucket;
  key = await blobKeyOf(FILE);
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

type Begun = { upload: string; partBytes: number; parts: number[] };
const begin = async (size = FILE.byteLength, sent: Sent = {}, of: BlobKey = key) =>
  files('POST', `/api/files/${of}/uploads?size=${size}`, sent);
const begun = async (sent: Sent = {}) => (await begin(FILE.byteLength, sent)).json<Begun>();
const part = (upload: string, n: number | string, bytes: Uint8Array, sent: Sent = {}) =>
  files('PUT', `/api/files/${key}/uploads/${upload}/parts/${n}`, { ...sent, bytes });
const complete = (upload: string, sent: Sent = {}) =>
  files('POST', `/api/files/${key}/uploads/${upload}/complete`, sent);
const held = async (of: BlobKey = key, owner = 'ada') =>
  (await (await files('GET', `/api/files/${of}`, { owner })).json<{ held: boolean }>()).held;

describe('a file in parts', () => {
  it('begins, takes each part in order, and stores the whole under its key', async () => {
    const res = await begin();
    expect(res.status).toBe(201);
    const { upload, partBytes, parts } = await res.json<Begun>();
    expect({ partBytes, parts }).toEqual({ partBytes: FILE_PART_BYTES, parts: [] });
    for (const [at, bytes] of PARTS.entries()) {
      const stored = await part(upload, at + 1, bytes);
      expect(stored.status).toBe(200);
      expect(await stored.json()).toEqual({ parts: PARTS.slice(0, at + 1).map((_, n) => n + 1) });
    }
    expect(await held()).toBe(false);
    const done = await complete(upload);
    expect(done.status).toBe(201);
    expect(await done.json()).toEqual({ stored: true });
    expect(await held()).toBe(true);
    // The whole is the owner's object; the upload's own object and its row are gone.
    expect(bucket.objects.size).toBe(1);
    expect(isFile(bucket.blob('ada', key))).toBe(true);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM blob_uploads').get()?.n).toBe(0);
    expect(db.sql.prepare('SELECT size FROM blobs').get()?.size).toBe(FILE.byteLength);
  });

  // "An upload dropped after a part resumes from the next part and stores the same key."
  it('resumes from the parts storage has, in this browser or another', async () => {
    const { upload } = await begun();
    await part(upload, 1, PARTS[0]!);
    const again = await begin();
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ upload, partBytes: FILE_PART_BYTES, parts: [1] });
    await part(upload, 2, PARTS[1]!);
    await part(upload, 3, PARTS[2]!);
    expect((await complete(upload)).status).toBe(201);
    expect(isFile(bucket.blob('ada', key))).toBe(true);
  });

  it('takes a part sent again in place of itself', async () => {
    const { upload } = await begun();
    await part(upload, 1, new Uint8Array(FILE_PART_BYTES));
    expect((await part(upload, 1, PARTS[0]!)).status).toBe(200);
    await part(upload, 2, PARTS[1]!);
    await part(upload, 3, PARTS[2]!);
    expect((await complete(upload)).status).toBe(201);
    expect(isFile(bucket.blob('ada', key))).toBe(true);
  });

  it('answers bytes already held without beginning anything', async () => {
    const { upload } = await begun();
    for (const [at, bytes] of PARTS.entries()) await part(upload, at + 1, bytes);
    await complete(upload);
    const res = await begin();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ held: true });
    expect(bucket.uploads.size).toBe(0);
  });

  it('stores a small file as one part', async () => {
    const smallKey = await blobKeyOf(SMALL);
    const { upload } = await (await begin(SMALL.byteLength, {}, smallKey)).json<Begun>();
    const base = `/api/files/${smallKey}/uploads/${upload}`;
    expect((await files('PUT', `${base}/parts/1`, { bytes: SMALL })).status).toBe(200);
    expect((await files('POST', `${base}/complete`)).status).toBe(201);
    expect(bucket.blob('ada', smallKey)).toEqual(SMALL);
  });

  // "A file in parts is checked as a single request is": bytes that do not hash to the key end the upload.
  it('refuses a whole that does not hash to its key, and keeps nothing', async () => {
    const { upload } = await begun();
    await part(upload, 1, PARTS[0]!);
    await part(upload, 2, PARTS[0]!);
    await part(upload, 3, PARTS[2]!);
    const res = await complete(upload);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'key_mismatch' });
    expect(bucket.objects.size).toBe(0);
    expect(await held()).toBe(false);
    expect((await complete(upload)).status).toBe(404);
    // Beginning again is a new upload.
    expect((await begun()).upload).not.toBe(upload);
  });

  it('stores an upload naming a document for that document’s owner', async () => {
    db.sql
      .prepare(
        "INSERT INTO documents (id, owner_id, name, saved_at, created_at, shareable) VALUES ('D', 'grace', 'D', 1, 1, 0)",
      )
      .run();
    expect((await begin(FILE.byteLength, { owner: 'ada' })).status).toBe(201);
    const res = await files('POST', `/api/files/${key}/uploads?size=5&document=D`, {
      owner: 'ada',
    });
    expect(res.status).toBe(403);
    const own = await files('POST', `/api/files/${key}/uploads?size=5&document=D`, {
      owner: 'grace',
    });
    expect(own.status).toBe(201);
    expect(db.sql.prepare('SELECT owner_id FROM blob_uploads WHERE size = 5').get()?.owner_id).toBe(
      'grace',
    );
  });
});

describe('a part refused', () => {
  it.each([
    ['a part past the next', 3, PARTS[2]!],
    ['a part past the last', 4, PARTS[2]!],
    ['a part that is not whole', 1, PARTS[2]!],
    ['a number that is none', '1.5', PARTS[0]!],
    ['part zero', 0, PARTS[0]!],
  ])('answers part_invalid for %s', async (_what, n, bytes) => {
    const { upload } = await begun();
    const res = await part(upload, n, bytes);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'part_invalid' });
    expect(bucket.uploads.get('r2-upload-1')?.size).toBe(0);
  });

  it('answers part_invalid for a last part that is not what is left of the size', async () => {
    const { upload } = await begun();
    await part(upload, 1, PARTS[0]!);
    await part(upload, 2, PARTS[1]!);
    expect((await part(upload, 3, PARTS[0]!)).status).toBe(400);
    const bodiless = await files('PUT', `/api/files/${key}/uploads/${upload}/parts/3`, {
      headers: { 'Content-Length': '5' },
    });
    expect(bodiless.status).toBe(400);
  });

  it('answers upload_not_found for an upload that is gone, another owner’s, or another key’s', async () => {
    const { upload } = await begun();
    for (const res of [
      await part('no-such-upload', 1, PARTS[0]!),
      await complete('no-such-upload'),
      await part(upload, 1, PARTS[0]!, { owner: 'mallory' }),
      await files('PUT', `/api/files/${'f'.repeat(64)}/uploads/${upload}/parts/1`, {
        bytes: PARTS[0]!,
      }),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'upload_not_found' });
    }
  });

  it('answers upload_incomplete for a complete before every part is stored', async () => {
    const { upload } = await begun();
    await part(upload, 1, PARTS[0]!);
    const res = await complete(upload);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'upload_incomplete', parts: [1] });
  });

  it('answers size_invalid for a begin that names no whole size', async () => {
    for (const size of ['0', '-4', '1.5', 'many', '']) {
      const res = await files('POST', `/api/files/${key}/uploads?size=${size}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'size_invalid' });
    }
    expect((await files('POST', `/api/files/${key}/uploads`)).status).toBe(400);
  });

  // "a file of exactly FILE_TAB_MAX_BYTES is stored and one byte more is refused before any byte travels"
  it('begins a file of the cap, and refuses one byte more before any byte travels', async () => {
    expect((await begin(FILE_TAB_MAX_BYTES)).status).toBe(201);
    const res = await begin(FILE_TAB_MAX_BYTES + 1);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'file_too_large', limitBytes: FILE_TAB_MAX_BYTES });
  });

  it('names a failure of object storage, and stores the whole when the complete is tried again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { upload } = await begun();
    bucket.failParts = true;
    expect((await part(upload, 1, PARTS[0]!)).status).toBe(502);
    bucket.failParts = false;
    for (const [at, bytes] of PARTS.entries()) await part(upload, at + 1, bytes);
    bucket.failPuts = true;
    const failed = await complete(upload);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: 'store_failed' });
    expect(await held()).toBe(false);
    bucket.failPuts = false;
    expect((await complete(upload)).status).toBe(201);
    expect(bucket.objects.size).toBe(1);
  });

  it('answers only its doors', async () => {
    const { upload } = await begun();
    const base = `/api/files/${key}/uploads`;
    for (const [method, path] of [
      ['GET', base],
      ['GET', `${base}/${upload}/complete`],
      ['POST', `${base}/${upload}/parts/1`],
      ['PUT', `${base}/${upload}/parts/1/more`],
      ['PUT', `/api/files/${key}/parts`],
    ] as const)
      expect((await files(method, path)).status).toBe(404);
  });
});

describe('usage', () => {
  const store = (bytes: Uint8Array, of: BlobKey, sent: Sent = {}) =>
    files('PUT', `/api/files/${of}`, { ...sent, bytes });

  it('answers what the caller’s blobs count, and no allowance where the deployment sets none', async () => {
    const smallKey = await blobKeyOf(SMALL);
    await store(SMALL, smallKey);
    await store(SMALL, smallKey, { owner: 'grace' });
    const res = await files('GET', '/api/files');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bytes: SMALL.byteLength, blobs: 1, allowanceBytes: null });
    expect((await files('GET', '/api/files', { owner: null })).status).toBe(400);
    expect((await files('POST', '/api/files')).status).toBe(404);
  });

  // "Usage is checked before the first byte: an upload that would pass the owner's allowance is refused with what
  // is left."
  it('refuses an upload that would pass the allowance, with what is left', async () => {
    db.env.FILE_MAX_BYTES_PER_OWNER = String(SMALL.byteLength + 10);
    const smallKey = await blobKeyOf(SMALL);
    expect((await store(SMALL, smallKey)).status).toBe(201);
    const next = Uint8Array.from([...SMALL, 1]);
    const nextKey = await blobKeyOf(next);
    const res = await store(next, nextKey);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'usage_exceeded', leftBytes: 10 });
    expect(await held(nextKey)).toBe(false);
    const inParts = await begin(next.byteLength, {}, nextKey);
    expect(inParts.status).toBe(403);
    expect(await inParts.json()).toEqual({ error: 'usage_exceeded', leftBytes: 10 });
    // Another owner's allowance is their own, and bytes already held cost nothing more.
    expect((await store(next, nextKey, { owner: 'grace' })).status).toBe(201);
    expect((await store(SMALL, smallKey)).status).toBe(200);
    expect(await (await files('GET', '/api/files')).json()).toEqual({
      bytes: SMALL.byteLength,
      blobs: 1,
      allowanceBytes: SMALL.byteLength + 10,
    });
  });

  it('takes an upload that fills the allowance exactly', async () => {
    db.env.FILE_MAX_BYTES_PER_OWNER = String(SMALL.byteLength);
    expect((await store(SMALL, await blobKeyOf(SMALL))).status).toBe(201);
  });
});

describe('a guest who signs up', () => {
  // "A guest who signs up takes their rows with them, so no byte moves."
  it('holds, as the account, what the guest stored', async () => {
    const smallKey = await blobKeyOf(SMALL);
    await files('PUT', `/api/files/${smallKey}`, { bytes: SMALL, owner: 'guest' });
    db.sql.prepare("UPDATE blobs SET owner_id = 'account' WHERE owner_id = 'guest'").run();
    expect(await held(smallKey, 'account')).toBe(true);
    expect(await held(smallKey, 'guest')).toBe(false);
    expect(bucket.blob('guest', smallKey)).toEqual(SMALL);
    expect(bucket.objects.size).toBe(1);
  });
});

describe('two beginning at once', () => {
  it('answers the upload that stands, and gives its own back to storage', async () => {
    const create = bucket.createMultipartUpload.bind(bucket);
    let raced = false;
    // The other begins while this one is asking storage for its upload.
    bucket.createMultipartUpload = async (name: string) => {
      const mine = await create(name);
      if (!raced) {
        raced = true;
        db.sql
          .prepare(
            "INSERT INTO blob_uploads (id, owner_id, key, size, r2_upload, begun_at) VALUES ('theirs', 'ada', ?, ?, 'r2-theirs', 1)",
          )
          .run(key, FILE.byteLength);
      }
      return mine;
    };
    const res = await begin();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ upload: 'theirs', partBytes: FILE_PART_BYTES, parts: [] });
    expect(bucket.uploads.size).toBe(0);
  });
});

describe('object storage failing an upload in parts', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('names a begin storage did not take, and begins nothing', async () => {
    bucket.createMultipartUpload = () => Promise.reject(new Error('internal error (10001)'));
    const res = await begin();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'store_failed' });
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM blob_uploads').get()?.n).toBe(0);
  });

  it('names a complete whose parts storage no longer has', async () => {
    const { upload } = await begun();
    for (const [at, bytes] of PARTS.entries()) await part(upload, at + 1, bytes);
    bucket.uploads.clear();
    expect((await complete(upload)).status).toBe(502);
    expect(await held()).toBe(false);
  });

  it('names a complete whose whole storage does not hand back', async () => {
    const { upload } = await begun();
    for (const [at, bytes] of PARTS.entries()) await part(upload, at + 1, bytes);
    bucket.get = () => Promise.resolve(null);
    expect((await complete(upload)).status).toBe(502);
    expect(await held()).toBe(false);
  });
});

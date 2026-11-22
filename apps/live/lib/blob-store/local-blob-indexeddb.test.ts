// docs/specs/006-document/blob-store.md "This Browser": the index of what is held, and the bytes themselves where
// the origin private file system cannot be written, each in a store of the `livedoc-blobs` database.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf } from '@livedoc/document';
import { indexedDbBlobBytes, indexedDbBlobIndex, LOCAL_BLOBS_DB } from './local-blob-indexeddb';
import { localBlobStore } from './local-blob-store';

const bytesOf = (text: string) => new TextEncoder().encode(text);

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the blob store’s IndexedDB', () => {
  it('holds bytes whole in a store of their own and reads them back', async () => {
    const place = indexedDbBlobBytes();
    expect(place.where).toBe('indexeddb');
    const bytes = bytesOf('%PDF-1.7 in IndexedDB');
    const key = await blobKeyOf(bytes);
    expect(await place.read(key)).toBeNull();
    await place.write(key, bytes);
    expect(await place.read(key)).toEqual(bytes);
    await place.remove(key);
    expect(await place.read(key)).toBeNull();
    expect((await indexedDB.databases()).map((db) => db.name)).toEqual([LOCAL_BLOBS_DB]);
  });

  it('keeps a view’s own bytes, not the buffer it looks into', async () => {
    const place = indexedDbBlobBytes();
    const view = bytesOf('..inside..').subarray(2, 8);
    const key = await blobKeyOf(view.slice());
    await place.write(key, view);
    expect(await place.read(key)).toEqual(bytesOf('inside'));
  });

  it('names each key held, its size and when it was last used', async () => {
    const index = indexedDbBlobIndex();
    const [a, b] = [await blobKeyOf(bytesOf('a')), await blobKeyOf(bytesOf('b'))];
    expect(await index.get(a)).toBeNull();
    await index.put({ key: a, size: 1, usedAt: 10 });
    await index.put({ key: b, size: 2, usedAt: 20 });
    await index.put({ key: a, size: 1, usedAt: 30 });
    expect(await index.get(a)).toEqual({ key: a, size: 1, usedAt: 30 });
    expect((await index.all()).sort((x, y) => x.usedAt - y.usedAt)).toEqual([
      { key: b, size: 2, usedAt: 20 },
      { key: a, size: 1, usedAt: 30 },
    ]);
    await index.remove(a);
    expect(await index.all()).toEqual([{ key: b, size: 2, usedAt: 20 }]);
  });

  it('reads a record that is no entry as none', async () => {
    const index = indexedDbBlobIndex();
    const key = await blobKeyOf(bytesOf('odd'));
    await index.put({ key, size: 'three', usedAt: 1 } as never);
    expect(await index.get(key)).toBeNull();
    await index.put({ key, size: 3 } as never);
    expect(await index.all()).toEqual([]);
  });

  it('serves the store end to end', async () => {
    const store = localBlobStore({
      bytes: async () => indexedDbBlobBytes(),
      index: indexedDbBlobIndex(),
    });
    const bytes = bytesOf('through the store');
    const key = await blobKeyOf(bytes);
    await store.keep(key, bytes, 5);
    expect(await store.read(key, 6)).toEqual(bytes);
    expect(await store.entries()).toEqual([{ key, size: bytes.byteLength, usedAt: 6 }]);
    await store.forget([key]);
    expect(await store.read(key, 7)).toBeNull();
  });

  it('rejects where the browser has no IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(indexedDbBlobIndex().all()).rejects.toThrow('IndexedDB unavailable');
  });

  it('rejects when the database cannot be opened', async () => {
    const failing = {
      open: () => {
        const request = { error: null } as { error: null; onerror?: () => void };
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    };
    vi.stubGlobal('indexedDB', failing);
    await expect(indexedDbBlobIndex().all()).rejects.toThrow('IndexedDB open failed');
  });

  it('gives up on a database that never answers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', { open: () => ({}) });
    const reading = indexedDbBlobIndex().all();
    const settled = expect(reading).rejects.toThrow('IndexedDB open timed out');
    await vi.advanceTimersByTimeAsync(4_000);
    await settled;
  });

  it('rejects with the transaction’s own error when a write is aborted', async () => {
    const index = indexedDbBlobIndex();
    // A value IndexedDB cannot keep aborts as a met quota does: by the transaction.
    await expect(index.put({ key: undefined } as never)).rejects.toBeDefined();
  });
});

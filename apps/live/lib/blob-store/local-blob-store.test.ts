// docs/specs/006-document/blob-store.md "This Browser": this browser's own store keeps bytes and reads the same
// bytes back, names what it holds in an index, refuses by name, and never half keeps.
import { describe, expect, it } from 'vitest';
import { blobKeyOf } from '@livedoc/document';
import { LocalBlobRefused, localBlobStore } from './local-blob-store';
import {
  memoryBlobBytes,
  memoryBlobIndex,
  memoryBlobStore,
  quotaExceeded,
} from './local-blob-testing';

const bytesOf = (text: string) => new TextEncoder().encode(text);
const refusal = async (act: Promise<unknown>) =>
  act.then(
    () => null,
    (error: unknown) => (error instanceof LocalBlobRefused ? error.code : `threw ${String(error)}`),
  );

describe('this browser’s blob store', () => {
  it('keeps bytes under their key and reads the same bytes back, marked used', async () => {
    const { store, index } = memoryBlobStore();
    const bytes = bytesOf('%PDF-1.7 a file');
    const key = await blobKeyOf(bytes);
    await store.keep(key, bytes, 100);
    expect(await store.entries()).toEqual([{ key, size: bytes.byteLength, usedAt: 100 }]);
    expect(await store.read(key, 250)).toEqual(bytes);
    // "names each key held, its size and when it was last used"
    expect(index.entries.get(key)).toEqual({ key, size: bytes.byteLength, usedAt: 250 });
  });

  it('answers null for a key it does not hold', async () => {
    const { store } = memoryBlobStore();
    expect(await store.read(await blobKeyOf(bytesOf('never kept')), 1)).toBeNull();
    expect(await store.entries()).toEqual([]);
  });

  it('forgets a key’s bytes and its entry', async () => {
    const { store, bytes: place } = memoryBlobStore();
    const one = bytesOf('one');
    const two = bytesOf('two');
    const [a, b] = [await blobKeyOf(one), await blobKeyOf(two)];
    await store.keep(a, one, 1);
    await store.keep(b, two, 2);
    await store.forget([a]);
    expect(await store.read(a, 3)).toBeNull();
    expect(place.held.has(a)).toBe(false);
    expect((await store.entries()).map((entry) => entry.key)).toEqual([b]);
  });

  // "`local_store_full` (its quota is met...)"; "Nothing is half kept."
  it('refuses as full when the browser’s quota is met, and keeps nothing of it', async () => {
    const { store, bytes: place, index } = memoryBlobStore(4);
    const bytes = bytesOf('more than four bytes');
    const key = await blobKeyOf(bytes);
    expect(await refusal(store.keep(key, bytes, 1))).toBe('local_store_full');
    expect(index.entries.size).toBe(0);
    expect(place.held.size).toBe(0);
  });

  it('leaves an earlier keep of the key whole when keeping it again is refused', async () => {
    const { store, bytes: place } = memoryBlobStore();
    const bytes = bytesOf('kept once');
    const key = await blobKeyOf(bytes);
    await store.keep(key, bytes, 1);
    place.quota = 0;
    expect(await refusal(store.keep(key, bytes, 9))).toBe('local_store_full');
    place.quota = Number.POSITIVE_INFINITY;
    expect(await store.entries()).toEqual([{ key, size: bytes.byteLength, usedAt: 1 }]);
    expect(await store.read(key, 2)).toEqual(bytes);
  });

  // "`local_store_unavailable` (no origin private file system and no IndexedDB, or one that fails)"
  it('refuses as unavailable where there is nowhere to keep bytes', async () => {
    const store = localBlobStore({
      bytes: async () => {
        throw new LocalBlobRefused('local_store_unavailable');
      },
      index: memoryBlobIndex(),
    });
    const bytes = bytesOf('nowhere');
    const key = await blobKeyOf(bytes);
    expect(await refusal(store.keep(key, bytes, 1))).toBe('local_store_unavailable');
    expect(await refusal(store.read(key, 1))).toBe('local_store_unavailable');
    expect(await refusal(store.forget([key]))).toBe('local_store_unavailable');
  });

  it('refuses as unavailable when its storage fails for any other reason', async () => {
    const place = memoryBlobBytes();
    const index = memoryBlobIndex();
    const store = localBlobStore({ bytes: async () => place, index });
    const bytes = bytesOf('a failing disk');
    const key = await blobKeyOf(bytes);
    place.write = async () => {
      throw new Error('the disk failed');
    };
    expect(await refusal(store.keep(key, bytes, 1))).toBe('local_store_unavailable');
    index.all = async () => {
      throw new Error('the index failed');
    };
    expect(await refusal(store.entries())).toBe('local_store_unavailable');
    index.get = async () => {
      throw quotaExceeded();
    };
    expect(await refusal(store.keep(key, bytes, 1))).toBe('local_store_full');
  });

  it('names the refusal of the keep, whatever tidying up after it meets', async () => {
    const place = memoryBlobBytes(0);
    const index = memoryBlobIndex();
    const store = localBlobStore({ bytes: async () => place, index });
    const bytes = bytesOf('refused, and the tidying fails');
    const key = await blobKeyOf(bytes);
    const failing = async () => {
      throw new Error('the index failed');
    };
    place.remove = failing;
    index.remove = failing;
    expect(await refusal(store.keep(key, bytes, 1))).toBe('local_store_full');
    // And with an earlier entry to put back, which fails too.
    const put = index.put.bind(index);
    let puts = 0;
    index.put = async (entry) => {
      puts += 1;
      if (puts > 1) throw new Error('the index failed');
      await put(entry);
    };
    index.entries.set(key, { key, size: bytes.byteLength, usedAt: 1 });
    expect(await refusal(store.keep(key, bytes, 2))).toBe('local_store_full');
  });

  // "bytes whose size is not the index's are not there"
  it('reads a key whose bytes are not the size its entry says as not there, and clears what is left', async () => {
    const { store, bytes: place, index } = memoryBlobStore();
    const bytes = bytesOf('whole file');
    const key = await blobKeyOf(bytes);
    await store.keep(key, bytes, 1);
    place.held.set(key, bytes.slice(0, 3));
    expect(await store.read(key, 2)).toBeNull();
    expect(index.entries.size).toBe(0);
    expect(place.held.size).toBe(0);
  });

  it('reads an entry whose bytes never arrived as not there, and removes the entry', async () => {
    const { store, index } = memoryBlobStore();
    const key = await blobKeyOf(bytesOf('a keep that never ended'));
    await index.put({ key, size: 23, usedAt: 1 });
    expect(await store.read(key, 2)).toBeNull();
    expect(index.entries.size).toBe(0);
  });

  it('reads an empty file as not there: a blob is never empty', async () => {
    const { store, bytes: place } = memoryBlobStore();
    const key = await blobKeyOf(bytesOf('made, never written'));
    place.held.set(key, new Uint8Array(0));
    expect(await store.read(key, 2)).toBeNull();
    expect(place.held.size).toBe(0);
  });

  it('takes bytes that have no entry as held, and names them from then on', async () => {
    const { store, bytes: place } = memoryBlobStore();
    const bytes = bytesOf('kept before the index was');
    const key = await blobKeyOf(bytes);
    place.held.set(key, bytes);
    expect(await store.read(key, 7)).toEqual(bytes);
    expect(await store.entries()).toEqual([{ key, size: bytes.byteLength, usedAt: 7 }]);
  });

  it('marks the time itself when none is handed', async () => {
    const { store } = memoryBlobStore();
    const bytes = bytesOf('now');
    const key = await blobKeyOf(bytes);
    const before = Date.now();
    await store.keep(key, bytes);
    expect((await store.entries())[0]!.usedAt).toBeGreaterThanOrEqual(before);
    await store.read(key);
    expect((await store.entries())[0]!.usedAt).toBeGreaterThanOrEqual(before);
  });
});

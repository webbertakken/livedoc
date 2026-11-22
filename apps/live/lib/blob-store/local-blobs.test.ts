// docs/specs/006-document/blob-store.md "This Browser": bytes of This Browser documents are never forgotten; a
// cloud document's are forgotten least recently used first past FILE_LOCAL_CACHE_MAX_BYTES, never one kept a moment
// ago, and all of them when the person signs out. The limits are proven by their arithmetic, with small ones handed.
import { describe, expect, it, vi } from 'vitest';
import {
  blobKeyOf,
  FILE_LOCAL_CACHE_MAX_BYTES,
  FILE_LOCAL_FRESH_MS,
  type BlobKey,
} from '@livedoc/document';
import { LocalBlobRefused } from './local-blob-store';
import { memoryBlobStore } from './local-blob-testing';
import { localBlobs } from './local-blobs';

const file = async (text: string) => {
  const bytes = new TextEncoder().encode(text);
  return { bytes, key: await blobKeyOf(bytes) };
};

function setUp(options: { quota?: number; maxBytes?: number; freshMs?: number } = {}) {
  const memory = memoryBlobStore(options.quota);
  const named = new Set<BlobKey>();
  const clock = { now: 1_000_000 };
  const persist = vi.fn(async () => true);
  const blobs = localBlobs({
    store: memory.store,
    named: async () => named,
    persist,
    now: () => clock.now,
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    freshMs: options.freshMs ?? 100,
  });
  const held = async () => (await memory.store.entries()).map((entry) => entry.key);
  return { ...memory, blobs, named, clock, persist, held };
}

describe('what this browser keeps of files', () => {
  it('has the spec’s limits', () => {
    expect(FILE_LOCAL_CACHE_MAX_BYTES).toBe(512 * 1024 * 1024);
    expect(FILE_LOCAL_FRESH_MS).toBe(10 * 60 * 1000);
  });

  // "`navigator.storage.persist()` is asked for when the first blob of a This Browser document is kept"
  it('asks the browser to keep its storage with the first document’s bytes, once', async () => {
    const { blobs, persist } = setUp();
    const [one, two, read] = [await file('one'), await file('two'), await file('read')];
    await blobs.keepRead(read.key, read.bytes);
    expect(persist).not.toHaveBeenCalled();
    await blobs.keepForDocument(one.key, one.bytes);
    await blobs.keepForDocument(two.key, two.bytes);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await blobs.read(one.key)).toEqual(one.bytes);
  });

  it('keeps a document’s bytes where the browser will not say whether it persists', async () => {
    const memory = memoryBlobStore();
    const blobs = localBlobs({
      store: memory.store,
      named: async () => new Set(),
      persist: async () => {
        throw new Error('not allowed here');
      },
    });
    const one = await file('kept anyway');
    await blobs.keepForDocument(one.key, one.bytes);
    expect(await blobs.read(one.key)).toEqual(one.bytes);
  });

  // "The least recently used are forgotten first past `FILE_LOCAL_CACHE_MAX_BYTES`"
  it('forgets the least recently used cloud bytes first once they pass the limit', async () => {
    const { blobs, clock, held } = setUp({ maxBytes: 10 });
    const [a, b, c] = [await file('aaaa'), await file('bbbb'), await file('cccc')];
    await blobs.keepRead(a.key, a.bytes);
    clock.now += 1_000;
    await blobs.keepRead(b.key, b.bytes);
    clock.now += 1_000;
    // Reading the oldest makes it the most recently used.
    expect(await blobs.read(a.key)).toEqual(a.bytes);
    clock.now += 1_000;
    await blobs.keepRead(c.key, c.bytes);
    expect((await held()).sort()).toEqual([a.key, c.key].sort());
  });

  // "Bytes of This Browser documents are never forgotten ... whatever the store weighs"
  it('never forgets a key a This Browser document names, and does not weigh it', async () => {
    const { blobs, named, clock, held } = setUp({ maxBytes: 5 });
    const [mine, a, b] = [
      await file('a document of my own'),
      await file('aaaa'),
      await file('bbbb'),
    ];
    await blobs.keepForDocument(mine.key, mine.bytes);
    named.add(mine.key);
    clock.now += 1_000;
    await blobs.keepRead(a.key, a.bytes);
    expect((await held()).sort()).toEqual([mine.key, a.key].sort());
    clock.now += 1_000;
    await blobs.keepRead(b.key, b.bytes);
    expect((await held()).sort()).toEqual([mine.key, b.key].sort());
  });

  // "Nor is a key kept within `FILE_LOCAL_FRESH_MS`"
  it('never forgets bytes kept a moment ago, whose document may be about to be written', async () => {
    const { blobs, clock, held } = setUp({ maxBytes: 1, freshMs: 500 });
    const [arriving, a] = [await file('arriving now'), await file('read from LiveDoc')];
    await blobs.keepForDocument(arriving.key, arriving.bytes);
    clock.now += 100;
    await blobs.keepRead(a.key, a.bytes);
    expect((await held()).sort()).toEqual([arriving.key, a.key].sort());
    // Later, with no document naming them, both are a cache's and go.
    clock.now += 1_000;
    const b = await file('b');
    await blobs.keepRead(b.key, b.bytes);
    expect(await held()).toEqual([b.key]);
  });

  // "`local_store_full` (its quota is met, after every forgettable blob was forgotten)"
  it('makes room for a document’s bytes by forgetting what may be forgotten', async () => {
    const { blobs, clock, held } = setUp({ quota: 12 });
    const [a, mine] = [await file('cloud bytes'), await file('my file')];
    await blobs.keepRead(a.key, a.bytes);
    clock.now += 1_000;
    await blobs.keepForDocument(mine.key, mine.bytes);
    expect(await held()).toEqual([mine.key]);
  });

  it('refuses a document’s bytes as full when nothing more can be forgotten', async () => {
    const { blobs, named, clock, held } = setUp({ quota: 12 });
    const [first, second] = [await file('my first'), await file('my second')];
    await blobs.keepForDocument(first.key, first.bytes);
    named.add(first.key);
    clock.now += 1_000;
    await expect(blobs.keepForDocument(second.key, second.bytes)).rejects.toMatchObject({
      code: 'local_store_full',
    });
    expect(await held()).toEqual([first.key]);
  });

  it('passes on a refusal that is not a full browser at once', async () => {
    const { blobs, bytes: place } = setUp();
    place.write = async () => {
      throw new Error('the disk failed');
    };
    const one = await file('one');
    await expect(blobs.keepForDocument(one.key, one.bytes)).rejects.toBeInstanceOf(
      LocalBlobRefused,
    );
  });

  // "a browser that refuses them changes nothing, and logs it"
  it('changes nothing when the browser refuses a cloud document’s bytes', async () => {
    const { blobs, held } = setUp({ quota: 2 });
    const a = await file('too many bytes');
    await expect(blobs.keepRead(a.key, a.bytes)).resolves.toBeUndefined();
    expect(await held()).toEqual([]);
  });

  it('reads as holding nothing, for a reader with somewhere else to ask, when the store cannot be reached', async () => {
    const { blobs, bytes: place } = setUp();
    const a = await file('kept');
    await blobs.keepRead(a.key, a.bytes);
    expect(await blobs.readKept(a.key)).toEqual(a.bytes);
    place.read = async () => {
      throw new Error('the disk failed');
    };
    expect(await blobs.readKept(a.key)).toBeNull();
    await expect(blobs.read(a.key)).rejects.toMatchObject({ code: 'local_store_unavailable' });
  });

  // "A key no record names any more ... is forgotten with it, unless another This Browser document names it."
  it('forgets a purged document’s keys, but not one another document names', async () => {
    const { blobs, named, held } = setUp();
    const [gone, shared, other] = [await file('gone'), await file('shared'), await file('other')];
    for (const each of [gone, shared, other]) await blobs.keepForDocument(each.key, each.bytes);
    named.add(shared.key);
    await blobs.forgetUnnamed([gone.key, shared.key]);
    expect((await held()).sort()).toEqual([shared.key, other.key].sort());
    // Nothing held of what is asked: nothing to do.
    await blobs.forgetUnnamed([gone.key]);
    expect((await held()).length).toBe(2);
  });

  // "Signing out forgets them"
  it('forgets every cloud document’s bytes when the person signs out, fresh or not', async () => {
    const { blobs, named, held } = setUp({ freshMs: 60_000 });
    const [mine, a, b] = [await file('mine'), await file('a'), await file('b')];
    await blobs.keepForDocument(mine.key, mine.bytes);
    named.add(mine.key);
    await blobs.keepRead(a.key, a.bytes);
    await blobs.keepRead(b.key, b.bytes);
    await blobs.forgetCloud();
    expect(await held()).toEqual([mine.key]);
  });

  it('uses the clock and the spec’s limits when none are handed', async () => {
    const memory = memoryBlobStore();
    const blobs = localBlobs({
      store: memory.store,
      named: async () => new Set(),
      persist: async () => false,
    });
    const a = await file('a');
    const before = Date.now();
    await blobs.keepRead(a.key, a.bytes);
    expect((await memory.store.entries())[0]!.usedAt).toBeGreaterThanOrEqual(before);
  });
});

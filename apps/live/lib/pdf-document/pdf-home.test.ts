// docs/specs/035-pdf-documents/live-editing-and-storage.md "Offline and This Browser"; docs/specs/006-document/
// blob-store.md "This Browser": a cloud PDF's file is kept once read whole and the next open reads it from this
// browser; a This Browser PDF reads its state from the record and its bytes from this browser alone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf } from '@livedoc/document';
import { memoryBlobStore } from '@/lib/blob-store/local-blob-testing';
import { localBlobs } from '@/lib/blob-store/local-blobs';
import { __setThisBrowserBlobs } from '@/lib/offline/offline-blobs';
import { PDF_BLOB, pdfStateWith, pdfTab, markIdsIn } from '@/lib/offline/offline-pdf-testing';
import { offlineSavePdfState } from '@/lib/offline/offline-pdf-documents';
import { __setOfflineBackend, offlinePutRecord } from '@/lib/offline/offline-store';
import { memBackend, testRecord } from '@/lib/offline/offline-test-utils';
import { keptBlobRead, pdfBlobSendOf, pdfReadsOf, thisBrowserBlobRead } from './pdf-home';

const scope = { ownerId: 'ada', documentId: 'D', tabId: 't1', shareCode: null };
const file = async (text: string) => {
  const bytes = new TextEncoder().encode(text);
  return { bytes, key: await blobKeyOf(bytes) };
};
const blobsInMemory = () => {
  const memory = memoryBlobStore();
  return {
    ...memory,
    blobs: localBlobs({
      store: memory.store,
      named: async () => new Set(),
      persist: async () => true,
    }),
  };
};

beforeEach(() => __setOfflineBackend(memBackend()));
afterEach(() => {
  __setOfflineBackend(null);
  __setThisBrowserBlobs(null);
});

describe('a cloud PDF’s stored file', () => {
  // "once read whole ... the next open of that file reads them from this browser with no request for the bytes"
  it('is read from LiveDoc once, kept, and read from this browser the next time', async () => {
    const { blobs } = blobsInMemory();
    const stored = await file('%PDF-1.7 on LiveDoc');
    const fromLiveDoc = vi.fn(async () => stored.bytes.slice());
    const read = keptBlobRead(fromLiveDoc, () => blobs);
    const first = await read(scope, stored.key);
    expect(first).toEqual(stored.bytes);
    // The engine's worker takes the buffer itself: what was kept is whole all the same.
    structuredClone(first.buffer, { transfer: [first.buffer] });
    expect(first.byteLength).toBe(0);
    expect(await read(scope, stored.key)).toEqual(stored.bytes);
    expect(fromLiveDoc).toHaveBeenCalledTimes(1);
  });

  it('is read from LiveDoc as before when this browser will not keep it or cannot be reached', async () => {
    const stored = await file('%PDF-1.7 never kept');
    const fromLiveDoc = vi.fn(async () => stored.bytes);
    const read = keptBlobRead(fromLiveDoc, () => ({
      readKept: async () => null,
      keepRead: async () => {},
    }));
    expect(await read(scope, stored.key)).toEqual(stored.bytes);
    expect(await read(scope, stored.key)).toEqual(stored.bytes);
    expect(fromLiveDoc).toHaveBeenCalledTimes(2);
  });

  it('passes on LiveDoc’s refusal, keeping nothing', async () => {
    const { blobs, bytes: place } = blobsInMemory();
    const read = keptBlobRead(
      async () => {
        throw new Error('404 blob_missing');
      },
      () => blobs,
    );
    await expect(read(scope, PDF_BLOB)).rejects.toThrow('blob_missing');
    expect(place.held.size).toBe(0);
  });
});

describe('a This Browser PDF', () => {
  it('reads its bytes from this browser alone', async () => {
    const { blobs } = blobsInMemory();
    const mine = await file('%PDF-1.7 my own');
    await blobs.keepForDocument(mine.key, mine.bytes);
    expect(await thisBrowserBlobRead(() => blobs)(scope, mine.key)).toEqual(mine.bytes);
  });

  // "A stored file this browser no longer holds ... is said as a file missing from storage is"
  it('answers bytes this browser no longer holds as a file missing from storage', async () => {
    const { blobs } = blobsInMemory();
    await expect(thisBrowserBlobRead(() => blobs)(scope, PDF_BLOB)).rejects.toMatchObject({
      code: 'blob_missing',
    });
  });

  it('reads its live changes from its record and its bytes from the browser’s store', async () => {
    const { blobs } = blobsInMemory();
    __setThisBrowserBlobs(blobs);
    const mine = await file('%PDF-1.7 in a record');
    await blobs.keepForDocument(mine.key, mine.bytes);
    await offlinePutRecord(
      testRecord({ id: 'D', tabs: [pdfTab('t1', mine.key, mine.bytes.byteLength)] }),
    );
    await offlineSavePdfState('D', 't1', pdfStateWith(['mine'], mine.key));
    const reads = pdfReadsOf('this-browser');
    const state = await reads.loadState(scope);
    expect(state.storedFile).toBe(mine.key);
    expect(markIdsIn(state.update)).toEqual(['mine']);
    expect(await reads.readBlob(scope, state.storedFile)).toEqual(mine.bytes);
    // The room's reads ask this browser first too.
    expect(await pdfReadsOf('room').readBlob(scope, mine.key)).toEqual(mine.bytes);
  });
});

// custom-stamps.md "Placing one": a custom stamp's picture is held for the document before its mark names it.
describe('bytes a change brings', () => {
  it('are kept in this browser for a This Browser PDF', async () => {
    const { blobs } = blobsInMemory();
    __setThisBrowserBlobs(blobs);
    const picture = await file('a picture');
    await pdfBlobSendOf('this-browser')(scope, picture.key, picture.bytes);
    expect(await blobs.read(picture.key)).toEqual(picture.bytes);
  });

  it('are sent for the document in the room, asked first', async () => {
    const picture = await file('a picture');
    const fetch = vi.fn(async () => new Response(JSON.stringify({ held: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    try {
      await pdfBlobSendOf('room')({ ...scope, shareCode: 'CODE' }, picture.key, picture.bytes);
    } finally {
      vi.unstubAllGlobals();
    }
    const [url] = fetch.mock.calls[0] as unknown as [string];
    expect(url).toContain(`/files/${picture.key}?document=D`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

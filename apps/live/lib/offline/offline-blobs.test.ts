// docs/specs/006-document/blob-store.md "This Browser": a key any offline record names, in the local Trash too, is
// never forgotten; the browser's own store keeps bytes in the origin private file system, or IndexedDB where a page
// cannot write it.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf } from '@livedoc/document';
import { Mark, PdfLiveChanges, PageName } from '@livedoc/pdf-documents';
import { fakeBlobDirectory } from '../blob-store/local-blob-testing';
import {
  __setThisBrowserBlobs,
  blobKeysOfRecord,
  offlineNamedBlobKeys,
  thisBrowserBlobs,
} from './offline-blobs';
import { OTHER_PDF_BLOB, PDF_BLOB, pdfTab } from './offline-pdf-testing';
import { __setOfflineBackend, offlinePutRecord } from './offline-store';
import { memBackend, testRecord, testTab } from './offline-test-utils';

beforeEach(() => {
  __setOfflineBackend(memBackend());
  __setThisBrowserBlobs(null);
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => {
  __setOfflineBackend(null);
  __setThisBrowserBlobs(null);
  vi.unstubAllGlobals();
});

const file = async (text: string) => {
  const bytes = new TextEncoder().encode(text);
  return { bytes, key: await blobKeyOf(bytes) };
};

describe('the keys This Browser documents name', () => {
  it('are each record’s PDF tabs’ files, in the local Trash too', async () => {
    const rec = testRecord({ id: 'A', tabs: [pdfTab('t1'), testTab('canvas')] });
    expect(blobKeysOfRecord(rec)).toEqual([PDF_BLOB]);
    await offlinePutRecord(rec);
    await offlinePutRecord(
      testRecord({ id: 'B', tabs: [pdfTab('t1', OTHER_PDF_BLOB)], trashedAt: 5 }),
    );
    await offlinePutRecord(testRecord({ id: 'C' }));
    expect([...(await offlineNamedBlobKeys())].sort()).toEqual([PDF_BLOB, OTHER_PDF_BLOB]);
  });

  // custom-stamps.md "Placing one": a custom stamp's picture is held as the document's file is.
  it('are the pictures its PDF tabs’ marks name too', () => {
    const doc = PdfLiveChanges.load();
    PdfLiveChanges.addMark(
      doc,
      Mark.stamp({
        id: 'paid',
        page: PageName.ofObject(1),
        rect: [0, 0, 10, 10],
        stamp: 'custom-0b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a',
        lines: ['Paid'],
        picture: { key: OTHER_PDF_BLOB, type: 'png', width: 4, height: 4 },
        colour: '#000000',
        opacity: 1,
        author: 'Ada',
        createdAt: 1,
      })!,
    );
    const state = PdfLiveChanges.encode(doc);
    const rec = testRecord({
      id: 'A',
      tabs: [pdfTab('t1')],
      pdfDocuments: [{ tabId: 't1', state, savedAt: 1 }],
    });
    expect(blobKeysOfRecord(rec)).toEqual([PDF_BLOB, OTHER_PDF_BLOB]);
  });
});

describe('the browser’s own blob store', () => {
  it('keeps bytes in the origin private file system, asks to persist, and never forgets a named key', async () => {
    const root = fakeBlobDirectory();
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root, persist } });
    const blobs = thisBrowserBlobs();
    expect(thisBrowserBlobs()).toBe(blobs);
    const mine = await file('my own PDF');
    const read = await file('a cloud PDF');
    await blobs.keepForDocument(mine.key, mine.bytes);
    await offlinePutRecord(
      testRecord({ id: 'A', tabs: [pdfTab('t1', mine.key, mine.bytes.byteLength)] }),
    );
    await blobs.keepRead(read.key, read.bytes);
    expect(persist).toHaveBeenCalledTimes(1);
    expect([...root.directories.get('blobs')!.files.keys()].sort()).toEqual(
      [mine.key, read.key].sort(),
    );
    await blobs.forgetCloud();
    expect([...root.directories.get('blobs')!.files.keys()]).toEqual([mine.key]);
    expect(await blobs.read(mine.key)).toEqual(mine.bytes);
  });

  it('keeps bytes in IndexedDB where the browser has no file system of its own, and does not ask what it cannot', async () => {
    vi.stubGlobal('navigator', {});
    const blobs = thisBrowserBlobs();
    const mine = await file('kept in IndexedDB');
    await blobs.keepForDocument(mine.key, mine.bytes);
    expect(await blobs.read(mine.key)).toEqual(mine.bytes);
  });

  it('is the store a test hands', () => {
    const handed = { read: async () => null } as never;
    __setThisBrowserBlobs(handed);
    expect(thisBrowserBlobs()).toBe(handed);
  });
});

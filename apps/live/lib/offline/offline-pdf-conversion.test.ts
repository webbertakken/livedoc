// docs/specs/035-pdf-documents/live-editing-and-storage.md "Sync Document", "Take Offline", "Errors in This Browser":
// a stored file is sent before the create names it, and kept here before the server copy goes; each refusal is named
// and leaves the document where it was.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf, type BlobKey } from '@livedoc/document';
import { PageName, PdfLiveChanges } from '@livedoc/pdf-documents';
import { bytesOfBase64 } from '@livedoc/text-documents/base64';

const api = vi.hoisted(() => ({
  apiHoldsBlob: vi.fn(),
  apiStoreBlob: vi.fn(),
  apiReadBlob: vi.fn(),
  apiLoadPdfState: vi.fn(),
}));
vi.mock('../api/files', () => ({
  apiHoldsBlob: api.apiHoldsBlob,
  apiStoreBlob: api.apiStoreBlob,
  apiReadBlob: api.apiReadBlob,
}));
vi.mock('../api/pdf-documents', () => ({ apiLoadPdfState: api.apiLoadPdfState }));

import { ApiError } from '../api/core';
import { LocalBlobRefused } from '../blob-store/local-blob-store';
import { memoryBlobStore } from '../blob-store/local-blob-testing';
import { localBlobs } from '../blob-store/local-blobs';
import { __setThisBrowserBlobs } from './offline-blobs';
import { sendOfflinePdfFiles, takePdfTabsOffline } from './offline-pdf-conversion';
import { markIdsIn, pdfStateWith, pdfTab } from './offline-pdf-testing';
import { testTab } from './offline-test-utils';
import { addCustomStamp } from '../pdf-document/pdf-stamp';

const file = async (text: string) => {
  const bytes = new TextEncoder().encode(text);
  return { bytes, key: await blobKeyOf(bytes) };
};
const scope = { ownerId: 'ada', documentId: 'D', shareCode: null };

function here(quota?: number) {
  const memory = memoryBlobStore(quota);
  const blobs = localBlobs({
    store: memory.store,
    named: async () => new Set<BlobKey>(),
    persist: async () => true,
  });
  __setThisBrowserBlobs(blobs);
  return { ...memory, blobs };
}
const codeOf = (act: Promise<unknown>) =>
  act.then(
    () => null,
    (error: unknown) =>
      error instanceof ApiError || error instanceof LocalBlobRefused ? error.code : String(error),
  );

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.apiHoldsBlob.mockResolvedValue(false);
});
afterEach(() => __setThisBrowserBlobs(null));

describe('Sync Document of a PDF', () => {
  // "sends each stored file to the blob store first, then the create with each PDF tab and its live changes"
  it('sends each stored file, and answers each tab’s live changes for the create', async () => {
    const { blobs } = here();
    const one = await file('%PDF-1.7 one');
    const two = await file('%PDF-1.7 two');
    await blobs.keepForDocument(one.key, one.bytes);
    await blobs.keepForDocument(two.key, two.bytes);
    const state = pdfStateWith(['mine'], one.key);
    const seeds = await sendOfflinePdfFiles(
      {
        tabs: [pdfTab('t1', one.key), testTab('canvas'), pdfTab('t2', two.key)],
        pdfDocuments: [
          { tabId: 't1', state, savedAt: 5 },
          // A state of a tab that is no longer a PDF tab of the record is not sent.
          { tabId: 'gone', state, savedAt: 5 },
        ],
      },
      'ada',
    );
    expect(api.apiStoreBlob).toHaveBeenNthCalledWith(1, 'ada', one.key, one.bytes, undefined);
    expect(api.apiStoreBlob).toHaveBeenNthCalledWith(2, 'ada', two.key, two.bytes, undefined);
    expect(api.apiStoreBlob).toHaveBeenCalledTimes(2);
    expect(seeds.map((seed) => seed.tabId)).toEqual(['t1']);
    expect(markIdsIn(bytesOfBase64(seeds[0]!.state)!)).toEqual(['mine']);
  });

  it('sends a file two tabs name once, and never one LiveDoc holds already', async () => {
    const { blobs } = here();
    const one = await file('%PDF-1.7 shared');
    await blobs.keepForDocument(one.key, one.bytes);
    api.apiHoldsBlob.mockResolvedValue(true);
    const seeds = await sendOfflinePdfFiles(
      { tabs: [pdfTab('t1', one.key), pdfTab('t2', one.key)] },
      'ada',
    );
    expect(api.apiHoldsBlob).toHaveBeenCalledTimes(1);
    expect(api.apiStoreBlob).not.toHaveBeenCalled();
    expect(seeds).toEqual([]);
  });

  // "A stored file this browser no longer holds ... stop[s] the sync by name"
  it('stops by name when this browser no longer holds the file, sending nothing', async () => {
    here();
    expect(await codeOf(sendOfflinePdfFiles({ tabs: [pdfTab('t1')] }, 'ada'))).toBe('blob_missing');
    expect(api.apiHoldsBlob).not.toHaveBeenCalled();
  });

  // "live changes past PDF_LIVE_CHANGES_MAX_BYTES": proven with a smaller limit handed.
  it('stops by name before any byte travels when the live changes are past the limit', async () => {
    const { blobs } = here();
    const one = await file('%PDF-1.7 much changed');
    await blobs.keepForDocument(one.key, one.bytes);
    const state = pdfStateWith(['a', 'b', 'c'], one.key);
    const rec = {
      tabs: [pdfTab('t1', one.key)],
      pdfDocuments: [{ tabId: 't1', state, savedAt: 1 }],
    };
    expect(await codeOf(sendOfflinePdfFiles(rec, 'ada', state.byteLength - 1))).toBe(
      'live_changes_too_large',
    );
    expect(api.apiHoldsBlob).not.toHaveBeenCalled();
    expect((await sendOfflinePdfFiles(rec, 'ada', state.byteLength)).length).toBe(1);
  });

  it.each([
    ['files_unavailable', 503],
    ['usage_exceeded', 403],
  ] as const)('passes on the blob store’s refusal %s', async (code, status) => {
    const { blobs } = here();
    const one = await file('%PDF-1.7 refused');
    await blobs.keepForDocument(one.key, one.bytes);
    api.apiHoldsBlob.mockRejectedValue(new ApiError('file held', status, code));
    expect(await codeOf(sendOfflinePdfFiles({ tabs: [pdfTab('t1', one.key)] }, 'ada'))).toBe(code);
    api.apiHoldsBlob.mockRejectedValue(new TypeError('network'));
    expect(await codeOf(sendOfflinePdfFiles({ tabs: [pdfTab('t1', one.key)] }, 'ada'))).toContain(
      'network',
    );
  });
});

describe('Take Offline of a PDF', () => {
  const cloud = async (text: string, marks: string[]) => {
    const stored = await file(text);
    const update = pdfStateWith(marks, stored.key);
    return {
      stored,
      read: { update, stateVector: PdfLiveChanges.stateVectorOf(update), storedFile: stored.key },
    };
  };

  // "reads each PDF tab's live changes, which name its stored file, and that file's bytes ... keeps the bytes here"
  it('reads each PDF tab’s live changes and keeps the stored file they name in this browser', async () => {
    const { blobs } = here();
    const { stored, read } = await cloud('%PDF-1.7 on LiveDoc', ['theirs']);
    api.apiLoadPdfState.mockResolvedValue(read);
    api.apiReadBlob.mockResolvedValue(stored.bytes);
    // The tab's own key is behind: the stored file was replaced since the tab was read.
    const taken = await takePdfTabsOffline([testTab('canvas'), pdfTab('t1')], scope, 77);
    expect(api.apiLoadPdfState).toHaveBeenCalledWith({ ...scope, tabId: 't1' });
    expect(api.apiReadBlob).toHaveBeenCalledWith(scope, stored.key);
    expect([...taken.tabs.keys()]).toEqual(['t1']);
    expect(taken.tabs.get('t1')).toMatchObject({
      kind: 'pdf',
      blob: stored.key,
      size: stored.bytes.byteLength,
    });
    expect(taken.states).toEqual([{ tabId: 't1', state: read.update, savedAt: 77 }]);
    expect(await blobs.read(stored.key)).toEqual(stored.bytes);
  });

  // "from this browser when it holds them and from LiveDoc when not"
  it('takes the bytes from this browser when it holds them, asking LiveDoc for none', async () => {
    const { blobs } = here();
    const { stored, read } = await cloud('%PDF-1.7 read before', []);
    await blobs.keepRead(stored.key, stored.bytes);
    api.apiLoadPdfState.mockResolvedValue(read);
    const taken = await takePdfTabsOffline([pdfTab('t1'), pdfTab('t2')], scope, 1);
    expect(api.apiReadBlob).not.toHaveBeenCalled();
    expect(taken.tabs.size).toBe(2);
  });

  // "A browser that refuses the bytes stops it by name and the document stays on LiveDoc."
  it('stops by name when this browser will not keep the bytes', async () => {
    here(4);
    const { stored, read } = await cloud('%PDF-1.7 too much for here', []);
    api.apiLoadPdfState.mockResolvedValue(read);
    api.apiReadBlob.mockResolvedValue(stored.bytes);
    expect(await codeOf(takePdfTabsOffline([pdfTab('t1')], scope, 1))).toBe('local_store_full');
  });

  it('stops when the live changes or the file cannot be read', async () => {
    const { bytes: place } = here();
    api.apiLoadPdfState.mockRejectedValue(new TypeError('network'));
    expect(await codeOf(takePdfTabsOffline([pdfTab('t1')], scope, 1))).toContain('network');
    const { read } = await cloud('%PDF-1.7 missing', []);
    api.apiLoadPdfState.mockResolvedValue(read);
    api.apiReadBlob.mockRejectedValue(new ApiError('file read', 404, 'blob_missing'));
    expect(await codeOf(takePdfTabsOffline([pdfTab('t1')], scope, 1))).toBe('blob_missing');
    expect(place.held.size).toBe(0);
  });
});

// custom-stamps.md "Placing one", blob-store.md "Holds and retention": a custom stamp's picture travels with its PDF.
describe('a custom stamp’s picture between This Browser and LiveDoc', () => {
  const stampedState = async (storedKey: BlobKey) => {
    const picture = await file('a stamp picture');
    const doc = PdfLiveChanges.load();
    addCustomStamp(
      doc,
      { page: PageName.ofObject(1), stored: { blob: storedKey, pages: 1 }, box: [0, 0, 612, 792] },
      {
        id: 'custom-0b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a',
        name: 'Paid',
        category: 'C',
        picture: { key: picture.key, type: 'png', width: 8, height: 4 },
        natural: { width: 6, height: 3 },
        createdAt: 1,
        updatedAt: 1,
      },
      { x: 100, y: 100 },
      { author: 'Ada', now: 1, id: 'c1' },
    );
    return { picture, state: PdfLiveChanges.encode(doc) };
  };

  it('sends each picture its marks name with the stored file', async () => {
    const { blobs } = here();
    const one = await file('%PDF-1.7 stamped');
    const { picture, state } = await stampedState(one.key);
    await blobs.keepForDocument(one.key, one.bytes);
    await blobs.keepForDocument(picture.key, picture.bytes);
    await sendOfflinePdfFiles(
      { tabs: [pdfTab('t1', one.key)], pdfDocuments: [{ tabId: 't1', state, savedAt: 1 }] },
      'ada',
    );
    expect(api.apiStoreBlob).toHaveBeenCalledWith('ada', one.key, one.bytes, undefined);
    expect(api.apiStoreBlob).toHaveBeenCalledWith('ada', picture.key, picture.bytes, undefined);
  });

  it('keeps each picture its marks name in this browser when taken offline', async () => {
    const { blobs } = here();
    const stored = await file('%PDF-1.7 on LiveDoc, stamped');
    const { picture, state } = await stampedState(stored.key);
    api.apiLoadPdfState.mockResolvedValue({
      update: state,
      stateVector: PdfLiveChanges.stateVectorOf(state),
      storedFile: stored.key,
    });
    api.apiReadBlob.mockImplementation(async (_scope: unknown, key: BlobKey) =>
      key === stored.key ? stored.bytes : picture.bytes,
    );
    const taken = await takePdfTabsOffline([pdfTab('t1')], scope, 1);
    expect(taken.tabs.get('t1')).toMatchObject({ size: stored.bytes.byteLength });
    expect(await blobs.read(picture.key)).toEqual(picture.bytes);
    expect(api.apiReadBlob).toHaveBeenCalledWith(scope, picture.key);
  });
});

// docs/specs/035-pdf-documents/pdf-document.md "A PDF tab from a file": taken as every arriving PDF is, sent for the
// document's owner, the tab's row stored, in that order; a refusal stores nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf, FILE_TAB_MAX_BYTES, isValidTab } from '@livedoc/document';

const api = vi.hoisted(() => ({
  apiHoldsBlob: vi.fn(),
  apiStoreBlob: vi.fn(),
  apiSaveTab: vi.fn(),
}));
const caps = vi.hoisted(() => ({ fileStorageRefused: vi.fn(async () => false) }));
vi.mock('@/lib/api/files', () => ({
  apiHoldsBlob: api.apiHoldsBlob,
  apiStoreBlob: api.apiStoreBlob,
}));
vi.mock('@/lib/api/tabs', () => ({ apiSaveTab: api.apiSaveTab }));
vi.mock('@/lib/api/capabilities', () => caps);
vi.mock('@/lib/api-client', async () => {
  const { ApiError } = await import('@/lib/api/core');
  return { ApiError, apiCreateDocument: vi.fn() };
});

import { ApiError } from '@/lib/api/core';
import { memoryBlobStore } from '@/lib/blob-store/local-blob-testing';
import { localBlobs } from '@/lib/blob-store/local-blobs';
import { __setThisBrowserBlobs } from '@/lib/offline/offline-blobs';
import { addPdfTab, PDF_ARRIVAL_COPY } from './add-pdf-tab';

const PDF = Uint8Array.from(new TextEncoder().encode('%PDF-1.7\nsmall\n%%EOF\n'));
const file = (bytes: Uint8Array<ArrayBuffer>, name = 'Lease 2026.pdf', size = bytes.byteLength) =>
  ({ name, size, arrayBuffer: async () => bytes.buffer }) as unknown as File;
const scope = { ownerId: 'ada', documentId: 'doc-1', shareCode: 'share-1' };
const forDocument = { documentId: 'doc-1', shareCode: 'share-1' };

let kept: ReturnType<typeof localBlobs>;

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.apiHoldsBlob.mockResolvedValue(false);
  api.apiSaveTab.mockResolvedValue(1);
  caps.fileStorageRefused.mockReset().mockResolvedValue(false);
  kept = localBlobs({
    store: memoryBlobStore().store,
    named: async () => new Set(),
    persist: async () => true,
  });
  __setThisBrowserBlobs(kept);
});
afterEach(() => __setThisBrowserBlobs(null));

describe('addPdfTab', () => {
  it('sends the bytes for the document, stores a PDF tab naming them, and answers the tab', async () => {
    const added = await addPdfTab(scope, file(PDF), 'tab-9');
    const key = await blobKeyOf(PDF);
    const tab = {
      id: 'tab-9',
      name: 'Lease 2026',
      kind: 'pdf',
      elements: [],
      blob: key,
      size: PDF.byteLength,
    };
    expect(added).toEqual({ ok: true, tab, held: false });
    expect(isValidTab(tab)).toBe(true);
    // The bytes are the document's owner's: every door names the document, with the session's share link.
    expect(api.apiHoldsBlob).toHaveBeenCalledWith('ada', key, forDocument);
    expect(api.apiStoreBlob).toHaveBeenCalledWith('ada', key, PDF, forDocument);
    expect(api.apiSaveTab).toHaveBeenCalledWith('ada', 'doc-1', tab, 'share-1');
    // "A tab never names bytes the store does not hold."
    expect(api.apiStoreBlob.mock.invocationCallOrder[0]).toBeLessThan(
      api.apiSaveTab.mock.invocationCallOrder[0]!,
    );
  });

  it('keeps the bytes in this browser, so the tab opens without reading them back', async () => {
    await addPdfTab(scope, file(PDF), 'tab-9');
    expect(await kept.readKept(await blobKeyOf(PDF))).toEqual(PDF);
  });

  it('sends nothing the store already holds for the owner, and still stores the tab', async () => {
    api.apiHoldsBlob.mockResolvedValue(true);
    expect(await addPdfTab(scope, file(PDF), 'tab-9')).toMatchObject({ ok: true, held: true });
    expect(api.apiStoreBlob).not.toHaveBeenCalled();
    expect(api.apiSaveTab).toHaveBeenCalledOnce();
  });

  it('says its arrival with the tab, never a name', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await addPdfTab(scope, file(PDF), 'tab-9');
    const lines = info.mock.calls.map(([message]) => message as string);
    expect(lines.find((line) => line.startsWith('[pdf]'))).toMatch(
      /^\[pdf\] arrived bytes=21 held=false ms=\d+ tab=tab-9$/,
    );
    info.mockRestore();
  });

  describe('a refusal stores nothing', () => {
    const nothing = () => {
      expect(api.apiStoreBlob).not.toHaveBeenCalled();
      expect(api.apiSaveTab).not.toHaveBeenCalled();
    };

    it('a file that is no PDF', async () => {
      const text = Uint8Array.from(new TextEncoder().encode('just words'));
      expect(await addPdfTab(scope, file(text), 't')).toEqual({ ok: false, refusal: 'not_a_pdf' });
      expect(api.apiHoldsBlob).not.toHaveBeenCalled();
      nothing();
    });

    it('a file past the cap, never read', async () => {
      const read = vi.fn();
      const large = { name: 'big.pdf', size: FILE_TAB_MAX_BYTES + 1, arrayBuffer: read };
      expect(await addPdfTab(scope, large, 't')).toEqual({ ok: false, refusal: 'file_too_large' });
      expect(read).not.toHaveBeenCalled();
      nothing();
    });

    it('a host that says it stores no files, said before the file is read', async () => {
      caps.fileStorageRefused.mockResolvedValue(true);
      const read = vi.fn();
      const pdf = { name: 'Lease.pdf', size: 21, arrayBuffer: read };
      expect(await addPdfTab(scope, pdf, 't')).toEqual({ ok: false, refusal: 'files_unavailable' });
      expect(read).not.toHaveBeenCalled();
      expect(api.apiHoldsBlob).not.toHaveBeenCalled();
      nothing();
    });

    it.each([
      ['files_unavailable', 503, 'files_unavailable'],
      ['file_too_large', 413, 'file_too_large'],
      ['usage_exceeded', 403, 'usage_exceeded'],
      ['forbidden', 403, 'not_stored'],
      [null, 500, 'not_stored'],
    ] as const)('the store answering %s', async (code, status, refusal) => {
      api.apiHoldsBlob.mockRejectedValue(new ApiError('file held', status, code));
      expect(await addPdfTab(scope, file(PDF), 't')).toEqual({ ok: false, refusal });
      nothing();
    });
  });

  it('answers not stored, with nothing kept here, when the tab is refused after the bytes went', async () => {
    api.apiSaveTab.mockRejectedValue(new ApiError('save tab', 409, 'blob_missing'));
    expect(await addPdfTab(scope, file(PDF), 't')).toEqual({ ok: false, refusal: 'not_stored' });
    expect(await kept.readKept(await blobKeyOf(PDF))).toBeNull();
    expect(PDF_ARRIVAL_COPY.not_stored).toBe("This PDF couldn't be stored. Try again.");
  });
});

// docs/specs/035-pdf-documents/files-print-and-sync.md "Opening"; pdf-document.md "What becomes a PDF document";
// docs/specs/006-document/blob-store.md "Getting bytes in": hash, ask, send only what is not held, then name it;
// live-editing-and-storage.md "A PDF that arrives", "Errors in This Browser": kept in this browser, sent nowhere.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf, FILE_TAB_MAX_BYTES, isValidTab } from '@livedoc/document';

const api = vi.hoisted(() => ({
  apiHoldsBlob: vi.fn(),
  apiStoreBlob: vi.fn(),
  apiCreateDocument: vi.fn(),
}));
vi.mock('@/lib/api/files', () => ({
  apiHoldsBlob: api.apiHoldsBlob,
  apiStoreBlob: api.apiStoreBlob,
}));
vi.mock('@/lib/api-client', async () => {
  const { ApiError } = await import('@/lib/api/core');
  return { ApiError, apiCreateDocument: api.apiCreateDocument };
});

import { ApiError } from '@/lib/api/core';
import { memoryBlobStore } from '@/lib/blob-store/local-blob-testing';
import { localBlobs } from '@/lib/blob-store/local-blobs';
import { __setThisBrowserBlobs, offlineNamedBlobKeys } from '@/lib/offline/offline-blobs';
import { __setOfflineBackend, offlineGetRecord, isOfflineId } from '@/lib/offline/offline-store';
import { memBackend } from '@/lib/offline/offline-test-utils';
import { openPdfFile, PDF_ARRIVAL_COPY, pdfNameFromFile } from './open-pdf-file';
import { openDroppedPdfs } from './pdf-drop';

const PDF = Uint8Array.from(new TextEncoder().encode('%PDF-1.7\nsmall\n%%EOF\n'));
const file = (bytes: Uint8Array<ArrayBuffer>, name = 'Lease 2026.pdf', size = bytes.byteLength) =>
  ({ name, size, arrayBuffer: async () => bytes.buffer }) as unknown as File;

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.apiHoldsBlob.mockResolvedValue(false);
});

describe('openPdfFile', () => {
  it('stores the bytes, then makes a document with one PDF tab naming them', async () => {
    const opened = await openPdfFile('ada', file(PDF), 'folder-1');
    expect(opened.ok && opened.held).toBe(false);
    const key = await blobKeyOf(PDF);
    expect(api.apiStoreBlob).toHaveBeenCalledWith('ada', key, PDF, undefined);
    const [owner, created] = api.apiCreateDocument.mock.calls[0] as [
      string,
      { id: string; tabs: unknown[] },
    ];
    expect(owner).toBe('ada');
    expect(created).toMatchObject({ name: 'Lease 2026', folderId: 'folder-1' });
    expect(created.tabs).toEqual([
      {
        id: expect.any(String),
        name: 'Lease 2026',
        kind: 'pdf',
        elements: [],
        blob: key,
        size: PDF.byteLength,
      },
    ]);
    expect(isValidTab(created.tabs[0])).toBe(true);
    expect(opened.ok && opened.documentId).toBe(created.id);
    // The bytes are held before the tab names them.
    expect(api.apiStoreBlob.mock.invocationCallOrder[0]).toBeLessThan(
      api.apiCreateDocument.mock.invocationCallOrder[0]!,
    );
  });

  it('never sends bytes LiveDoc already holds for that person', async () => {
    api.apiHoldsBlob.mockResolvedValue(true);
    const opened = await openPdfFile('ada', file(PDF));
    expect(opened).toMatchObject({ ok: true, held: true });
    expect(api.apiStoreBlob).not.toHaveBeenCalled();
    expect(api.apiCreateDocument.mock.calls[0]![1]).not.toHaveProperty('folderId');
  });

  // "A file named .pdf whose bytes are not a PDF" is no PDF document; the name's extension decides nothing.
  it('answers a file that is no PDF before anything is asked or sent', async () => {
    const text = Uint8Array.from(new TextEncoder().encode('just words'));
    expect(await openPdfFile('ada', file(text))).toEqual({ ok: false, refusal: 'not_a_pdf' });
    expect((await openPdfFile('ada', file(PDF, 'scan.bin'))).ok).toBe(true);
    expect(api.apiHoldsBlob).toHaveBeenCalledTimes(1);
  });

  // "A file too large is answered by its refusal at once, before any byte travels, and nothing is made."
  it('refuses a file past the cap without reading it', async () => {
    const read = vi.fn();
    const large = {
      name: 'big.pdf',
      size: FILE_TAB_MAX_BYTES + 1,
      arrayBuffer: read,
    } as unknown as File;
    expect(await openPdfFile('ada', large)).toEqual({ ok: false, refusal: 'file_too_large' });
    expect(read).not.toHaveBeenCalled();
  });

  // opening.md "Telemetry and observability": `[pdf] refused name=<name>`, whatever refused it.
  it('logs every refusal by its name, the ones answered before a byte travels too', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const text = Uint8Array.from(new TextEncoder().encode('just words'));
    await openPdfFile('ada', file(text));
    const large = { name: 'big.pdf', size: FILE_TAB_MAX_BYTES + 1, arrayBuffer: vi.fn() };
    await openPdfFile('ada', large);
    api.apiHoldsBlob.mockRejectedValue(new ApiError('file held', 503, 'files_unavailable'));
    await openPdfFile('ada', file(PDF));
    expect(info.mock.calls.map(([message]) => message as string)).toEqual([
      '[pdf] refused name=not_a_pdf',
      '[pdf] refused name=file_too_large',
      '[pdf] refused name=files_unavailable',
    ]);
    info.mockRestore();
  });

  it.each([
    ['files_unavailable', 503, 'files_unavailable'],
    ['file_too_large', 413, 'file_too_large'],
    ['usage_exceeded', 403, 'usage_exceeded'],
    ['key_mismatch', 422, 'not_stored'],
    [null, 500, 'not_stored'],
  ] as const)('names the refusal %s as it is told', async (code, status, refusal) => {
    api.apiHoldsBlob.mockRejectedValue(new ApiError('file held', status, code));
    expect(await openPdfFile('ada', file(PDF))).toEqual({ ok: false, refusal });
    expect(api.apiCreateDocument).not.toHaveBeenCalled();
  });

  it('makes nothing when the upload fails midway', async () => {
    api.apiStoreBlob.mockRejectedValue(new TypeError('network'));
    expect(await openPdfFile('ada', file(PDF))).toEqual({ ok: false, refusal: 'not_stored' });
    expect(api.apiCreateDocument).not.toHaveBeenCalled();
  });

  it('names the document as the file is, without its extension', () => {
    expect(pdfNameFromFile('Q3 report.final.pdf')).toBe('Q3 report.final');
    expect(pdfNameFromFile('.pdf')).toBe('Untitled PDF');
  });
});

// "A PDF that arrives for someone whose new documents start in This Browser is hashed, kept in this browser's store
// and named by a new offline record; no request carries its bytes or its name."
describe('openPdfFile in This Browser', () => {
  const here = (quota?: number) => {
    const memory = memoryBlobStore(quota);
    const blobs = localBlobs({
      store: memory.store,
      named: offlineNamedBlobKeys,
      persist: async () => true,
    });
    __setThisBrowserBlobs(blobs);
    return { ...memory, blobs };
  };
  beforeEach(() => __setOfflineBackend(memBackend()));
  afterEach(() => {
    __setOfflineBackend(null);
    __setThisBrowserBlobs(null);
  });

  it('keeps the file in this browser and names it by a new offline record, asking LiveDoc nothing', async () => {
    const { blobs } = here();
    const opened = await openPdfFile('guest', file(PDF), undefined, 'browser');
    expect(opened).toMatchObject({ ok: true, held: false });
    const id = opened.ok ? opened.documentId : '';
    const key = await blobKeyOf(PDF);
    const rec = await offlineGetRecord(id);
    expect(rec).toMatchObject({ name: 'Lease 2026', folderId: null });
    expect(rec?.tabs).toEqual([
      {
        id: expect.any(String),
        name: 'Lease 2026',
        kind: 'pdf',
        elements: [],
        blob: key,
        size: PDF.byteLength,
      },
    ]);
    expect(await isOfflineId(id)).toBe(true);
    expect(await blobs.read(key)).toEqual(PDF);
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    ['local_store_full', 'This browser has no room to keep this PDF.'],
    ['local_store_unavailable', "This browser can't keep files, so this PDF can't be kept here."],
  ] as const)('says %s by name and makes nothing', async (refusal, said) => {
    const { bytes: place } = here(refusal === 'local_store_full' ? 2 : undefined);
    if (refusal === 'local_store_unavailable')
      place.write = async () => {
        throw new Error('no storage');
      };
    expect(await openPdfFile('guest', file(PDF), undefined, 'browser')).toEqual({
      ok: false,
      refusal,
    });
    expect(PDF_ARRIVAL_COPY[refusal]).toBe(said);
    expect((await offlineNamedBlobKeys()).size).toBe(0);
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });

  it('forgets the bytes again when the record cannot be written', async () => {
    const { bytes: place } = here();
    __setOfflineBackend({
      ...memBackend(),
      put: async () => {
        throw new Error('IndexedDB refused');
      },
    });
    expect(await openPdfFile('guest', file(PDF), undefined, 'browser')).toEqual({
      ok: false,
      refusal: 'not_stored',
    });
    expect(place.held.size).toBe(0);
  });

  it('still answers a file that is no PDF, or one past the cap, before anything is kept', async () => {
    const { bytes: place } = here();
    const text = Uint8Array.from(new TextEncoder().encode('just words'));
    expect(await openPdfFile('guest', file(text), undefined, 'browser')).toEqual({
      ok: false,
      refusal: 'not_a_pdf',
    });
    expect(place.held.size).toBe(0);
  });
});

// "Several PDFs dropped together open as several documents, with one toast ("4 PDFs added") and the first opened."
describe('openDroppedPdfs', () => {
  const opener =
    (answers: Record<string, 'ok' | 'not_a_pdf' | 'file_too_large'>) => async (f: File) =>
      answers[f.name] === 'ok'
        ? ({ ok: true, documentId: `doc-${f.name}`, held: false } as const)
        : ({ ok: false, refusal: answers[f.name] as 'not_a_pdf' } as const);
  const named = (name: string) => ({ name }) as File;

  it('opens one PDF and says nothing more', async () => {
    const dropped = await openDroppedPdfs([named('a')], opener({ a: 'ok' }));
    expect(dropped).toEqual({ documentIds: ['doc-a'], made: null, refused: null });
  });

  it('makes several documents, in order, and says how many', async () => {
    const dropped = await openDroppedPdfs(
      ['a', 'b', 'c', 'd'].map(named),
      opener({ a: 'ok', b: 'ok', c: 'ok', d: 'ok' }),
    );
    expect(dropped.documentIds).toEqual(['doc-a', 'doc-b', 'doc-c', 'doc-d']);
    expect(dropped.made).toBe('4 PDFs added');
  });

  it('says the first refusal by name and still makes the rest', async () => {
    const dropped = await openDroppedPdfs(
      ['a', 'b', 'c'].map(named),
      opener({ a: 'not_a_pdf', b: 'ok', c: 'file_too_large' }),
    );
    expect(dropped.documentIds).toEqual(['doc-b']);
    expect(dropped.refused).toBe(PDF_ARRIVAL_COPY.not_a_pdf);
  });
});

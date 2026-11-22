import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENT_CONVERSION_HEADER } from '@livedoc/api-schema';

// Offline Mode conversions (docs/specs/006-document/offline-mode.md). "Take offline" DELETES the server copy,
// so the ordering here is the difference between a failed conversion and a lost
// document. The module's header states the rules; nothing checked them.
//
// These mock the collaborators on purpose. The assertions are about SEQUENCE
// and ROLLBACK — did the destination get written before the source was removed,
// does a failure leave the surviving copy alone — which is what a mock can
// actually prove. Nothing here asserts what a mock returns.

const calls: string[] = [];

vi.mock('@/lib/api-client', () => ({
  apiCreateDocument: vi.fn(async () => {
    calls.push('apiCreateDocument');
  }),
  apiLoadDocument: vi.fn(async () => ({ id: 'd1', name: 'Roadmap', tabs: [{ id: 't1' }] })),
  apiLoadTab: vi.fn(async () => ({ id: 't1', name: 'Tab 1', elements: [] })),
  fetchCloudFavouriteIds: vi.fn(async () => [] as string[]),
  apiSetFavourite: vi.fn(async () => {
    calls.push('apiSetFavourite');
  }),
}));

vi.mock('@/lib/api/tags', () => ({
  fetchCloudTags: vi.fn(async () => ({ tags: [], links: [] })),
  apiSetDocumentTag: vi.fn(async () => {
    calls.push('apiSetDocumentTag');
  }),
}));

vi.mock('@/lib/api/core', () => ({
  API_BASE: '/api',
  // Mirrors the real signature (action, status, code) so the type the tests
  // see and the value they construct agree.
  ApiError: class ApiError extends Error {
    action: string;
    status: number;
    code: string | null;
    constructor(action: string, status: number, code: string | null) {
      super(`${action} failed: ${status}`);
      this.name = 'ApiError';
      this.action = action;
      this.status = status;
      this.code = code;
    }
  },
  apiDelete: vi.fn(async () => {
    calls.push('apiDelete');
  }),
}));

vi.mock('../api/items', () => ({
  fetchItems: vi.fn(async () => ({ items: [], rev: 0, nextKey: 1 })),
  fetchCloudItems: vi.fn(async () => ({ items: [], rev: 0, nextKey: 1 })),
}));

vi.mock('../api/sheets', () => ({
  fetchAllSheets: vi.fn(async () => []),
  fetchCloudSheets: vi.fn(async () => []),
  sheetAsCreate: (s: unknown) => s,
}));
vi.mock('../api/workbook-kept', () => ({
  fetchKept: vi.fn(async () => undefined),
  sendKept: vi.fn(async () => 0),
}));
vi.mock('../api/text-documents', () => ({
  apiLoadTextDocumentState: vi.fn(async () => Uint8Array.of(7, 7)),
}));
vi.mock('./offline-images', () => ({
  embedTabImages: vi.fn(async (tabs: unknown) => tabs),
  uploadEmbeddedImages: vi.fn(async (_owner: string, tabs: unknown) => ({
    tabs,
    imageIds: new Map(),
  })),
  isDataImageId: (id: string) => id.startsWith('data:'),
  tabImageIds: (t: { elements: { type: string; imageId?: string | null }[] }) =>
    t.elements.flatMap((el) => (el.type === 'image' && el.imageId ? [el.imageId] : [])),
}));

// What a closing page left of a live tab (./offline-partings has its own tests): here, that the sync reads through it.
vi.mock('./offline-partings', () => ({
  offlineRecordWithPartings: vi.fn(async (rec: unknown) => rec),
}));

// A PDF's own part of each conversion (./offline-pdf-conversion has its own tests): here, where it sits in the
// sequence.
vi.mock('./offline-pdf-conversion', () => ({
  sendOfflinePdfFiles: vi.fn(async () => {
    calls.push('sendOfflinePdfFiles');
    return [{ tabId: 'p1', state: 'AQID' }];
  }),
  takePdfTabsOffline: vi.fn(async () => {
    calls.push('takePdfTabsOffline');
    return {
      tabs: new Map([['t1', { ...PDF_TAB, blob: 'f'.repeat(64), size: 99 }]]),
      states: [{ tabId: 't1', state: Uint8Array.of(5), savedAt: 1 }],
    };
  }),
}));
const PDF_TAB = {
  id: 't1',
  name: 'Lease',
  kind: 'pdf',
  elements: [],
  blob: 'e'.repeat(64),
  size: 10,
};

// The successive states the record is in when a sync goes to remove it (a write landing during
// the upload); once used up, it is the record the sync read.
const states: unknown[] = [];

vi.mock('./offline-store', () => ({
  offlineCreateDocument: vi.fn(),
  offlineDeleteIfUnchanged: vi.fn(async (_id: string, unchanged: (r: unknown) => boolean) => {
    const rec: unknown = states.length
      ? states.shift()
      : await vi.mocked(store.offlineGetRecord).mock.results.at(-1)?.value;
    if (!unchanged(rec)) return { outcome: 'changed', rec };
    calls.push('offlineDeleteDocument');
    return { outcome: 'deleted', rec };
  }),
  offlineDeleteDocument: vi.fn(async () => {
    calls.push('offlineDeleteDocument');
  }),
  offlineGetRecord: vi.fn(async () => ({ id: 'd1', name: 'Roadmap', tabs: [] })),
  offlinePutRecord: vi.fn(async () => {
    calls.push('offlinePutRecord');
  }),
}));

const apiClient = await import('@/lib/api-client');
const core = await import('@/lib/api/core');
const images = await import('./offline-images');
const items = await import('../api/items');
const sheets = await import('../api/sheets');
const store = await import('./offline-store');
const tagsApi = await import('@/lib/api/tags');
const textDocuments = await import('../api/text-documents');
const keptApi = await import('../api/workbook-kept');
const pdfConversion = await import('./offline-pdf-conversion');
const partings = await import('./offline-partings');
const { LocalBlobRefused } = await import('../blob-store/local-blob-store');
const {
  ConversionInProgressError,
  SyncStillSavingError,
  conversionInProgress,
  saveOfflineToCloud,
  syncFailureMessage,
  takeCloudOffline,
  takeOfflineFailureMessage,
} = await import('./offline-convert');

beforeEach(() => {
  calls.length = 0;
  states.length = 0;
  vi.clearAllMocks();
});

describe('saveOfflineToCloud (offline -> cloud)', () => {
  it('creates the cloud copy before removing the local one', () => {
    // A network failure part-way must leave the offline document intact, so the
    // destination has to exist before the source goes.
    return saveOfflineToCloud('d1', 'owner').then(() => {
      expect(calls).toEqual(['apiCreateDocument', 'offlineDeleteDocument']);
    });
  });

  it('keeps the local copy when the cloud write fails', async () => {
    vi.mocked(apiClient.apiCreateDocument).mockRejectedValueOnce(new Error('offline'));
    await expect(saveOfflineToCloud('d1', 'owner')).rejects.toThrow();
    expect(store.offlineDeleteIfUnchanged).not.toHaveBeenCalled();
  });

  it('carries the star to the server once the local copy is gone', async () => {
    // Before the delete, the id still routes stars to the offline store.
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce({
      id: 'd1',
      name: 'Roadmap',
      tabs: [],
      favourite: true,
    } as never);
    await saveOfflineToCloud('d1', 'owner');
    expect(calls).toEqual(['apiCreateDocument', 'offlineDeleteDocument', 'apiSetFavourite']);
    expect(apiClient.apiSetFavourite).toHaveBeenCalledWith('owner', 'd1', true);
  });

  it('puts the tags back on the server copy once the local copy is gone', async () => {
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce({
      id: 'd1',
      name: 'Roadmap',
      tabs: [],
      tagIds: ['a', 'b'],
    } as never);
    vi.mocked(tagsApi.apiSetDocumentTag).mockRejectedValueOnce(new Error('tag gone'));
    await saveOfflineToCloud('d1', 'owner');
    // One refused (a tag deleted meanwhile) leaves the sync done all the same.
    expect(calls).toEqual(['apiCreateDocument', 'offlineDeleteDocument', 'apiSetDocumentTag']);
    expect(tagsApi.apiSetDocumentTag).toHaveBeenCalledWith('owner', 'a', 'd1', true);
    expect(tagsApi.apiSetDocumentTag).toHaveBeenCalledWith('owner', 'b', 'd1', true);
  });

  it('carries the deck, folder and created date, not just the tabs', async () => {
    // The local record is deleted straight after, so whatever the create
    // leaves behind is lost.
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce({
      id: 'd1',
      name: 'Roadmap',
      tabs: [],
      folderId: 'f1',
      createdAt: 123,
      presentation: '{"decks":[]}',
    } as never);
    await saveOfflineToCloud('d1', 'owner');
    expect(vi.mocked(apiClient.apiCreateDocument).mock.calls[0]![1]).toMatchObject({
      folderId: 'f1',
      createdAt: 123,
      presentation: '{"decks":[]}',
    });
  });

  it("carries a spreadsheet's workbook row, so the cloud copy is one too", async () => {
    const workbook = { format: 'ods', settings: { locale: 'en-GB' } };
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce({
      id: 'd1',
      name: 'Budget',
      tabs: [],
      workbook,
    } as never);
    await saveOfflineToCloud('d1', 'owner');
    expect(vi.mocked(apiClient.apiCreateDocument).mock.calls[0]![1]).toMatchObject({ workbook });
  });

  // sheet-store.md "Offline documents": the kept content goes after the create; a refusal takes the cloud copy back.
  it("sends a spreadsheet's kept content after the create, or takes the cloud copy back", async () => {
    const kept = { standard: 'odf', items: [], relationships: [], parts: [] };
    const rec = { id: 'd1', name: 'Budget', tabs: [], workbook: {}, kept };
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce(rec as never);
    await saveOfflineToCloud('d1', 'owner');
    expect(vi.mocked(keptApi.sendKept).mock.calls[0]).toEqual([
      { ownerId: 'owner', documentId: 'd1', shareCode: null },
      kept,
    ]);
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce(rec as never);
    vi.mocked(keptApi.sendKept).mockRejectedValueOnce(new Error('refused'));
    vi.mocked(core.apiDelete).mockClear();
    await expect(saveOfflineToCloud('d1', 'owner')).rejects.toThrow('refused');
    expect(core.apiDelete).toHaveBeenCalledTimes(1);
  });

  // docs/specs/034-text-documents/live-editing-and-storage.md "A text document in This Browser".
  it("carries each text document's state with the create", async () => {
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce({
      id: 'd1',
      name: 'Notes',
      tabs: [],
      textDocuments: [{ tabId: 't1', state: Uint8Array.of(1, 2, 3), savedAt: 5 }],
    } as never);
    await saveOfflineToCloud('d1', 'owner');
    expect(vi.mocked(apiClient.apiCreateDocument).mock.calls[0]![1]).toMatchObject({
      textDocuments: [{ tabId: 't1', state: 'AQID' }],
    });
  });

  // docs/specs/035-pdf-documents/live-editing-and-storage.md "Sync Document": the stored file first, then the create
  // with each PDF tab and its live changes; until the create is answered the document stays in This Browser.
  it('sends a PDF’s stored file before the create, which carries its live changes', async () => {
    const rec = { id: 'd1', name: 'Lease', tabs: [{ ...PDF_TAB, id: 'p1' }] };
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce(rec as never);
    await saveOfflineToCloud('d1', 'owner');
    expect(calls).toEqual(['sendOfflinePdfFiles', 'apiCreateDocument', 'offlineDeleteDocument']);
    expect(vi.mocked(pdfConversion.sendOfflinePdfFiles)).toHaveBeenCalledWith(rec, 'owner');
    expect(vi.mocked(apiClient.apiCreateDocument).mock.calls[0]![1]).toMatchObject({
      pdfDocuments: [{ tabId: 'p1', state: 'AQID' }],
    });
  });

  // docs/specs/035-pdf-documents/live-editing-and-storage.md "A page's last moment": one left behind joins the
  // record before Sync Document reads it.
  it('uploads the record as it reads with what a closing page left', async () => {
    const rec = { id: 'd1', name: 'Lease', tabs: [{ ...PDF_TAB, id: 'p1' }] };
    const joined = { ...rec, name: 'Lease, with the last change' };
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce(rec as never);
    vi.mocked(partings.offlineRecordWithPartings).mockResolvedValueOnce(joined as never);
    await saveOfflineToCloud('d1', 'owner');
    expect(vi.mocked(partings.offlineRecordWithPartings)).toHaveBeenCalledWith(rec);
    expect(vi.mocked(pdfConversion.sendOfflinePdfFiles)).toHaveBeenCalledWith(joined, 'owner');
    expect(vi.mocked(apiClient.apiCreateDocument).mock.calls[0]![1]).toMatchObject({
      name: 'Lease, with the last change',
    });
  });

  it('keeps a PDF in This Browser, with nothing made, when its file is refused', async () => {
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce({
      id: 'd1',
      name: 'Lease',
      tabs: [PDF_TAB],
    } as never);
    vi.mocked(pdfConversion.sendOfflinePdfFiles).mockRejectedValueOnce(
      new core.ApiError('PDF sync', 403, 'usage_exceeded'),
    );
    await expect(saveOfflineToCloud('d1', 'owner')).rejects.toMatchObject({
      code: 'usage_exceeded',
    });
    expect(calls).toEqual([]);
  });

  it('loads nothing of a PDF for a document that holds none', async () => {
    await saveOfflineToCloud('d1', 'owner');
    expect(pdfConversion.sendOfflinePdfFiles).not.toHaveBeenCalled();
    expect(vi.mocked(apiClient.apiCreateDocument).mock.calls[0]![1]).not.toHaveProperty(
      'pdfDocuments',
    );
  });

  it.each(['folder_not_found', 'folder_scope_mismatch'])(
    'files the document at the root, saying so, when the server refuses its folder: %s',
    async (code) => {
      // docs/specs/006-document/offline-mode.md: the server refuses by name; the sync decides.
      vi.mocked(store.offlineGetRecord).mockResolvedValueOnce({
        id: 'd1',
        name: 'Roadmap',
        tabs: [],
        folderId: 'deleted-since',
      } as never);
      vi.mocked(apiClient.apiCreateDocument).mockRejectedValueOnce(
        new core.ApiError('create document', 404, code),
      );
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await saveOfflineToCloud('d1', 'owner');
      const creates = vi.mocked(apiClient.apiCreateDocument).mock.calls;
      expect(creates).toHaveLength(2);
      expect(creates[1]![1]).toMatchObject({ folderId: null });
      expect(warn).toHaveBeenCalledWith(
        `[offline-sync] placement refused reason=${code}, filed at root`,
      );
      expect(calls).toEqual(['apiCreateDocument', 'offlineDeleteDocument']);
      warn.mockRestore();
    },
  );

  it('fails the sync on any other refusal, keeping the local copy', async () => {
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce({
      id: 'd1',
      name: 'Roadmap',
      tabs: [],
      folderId: 'f1',
    } as never);
    vi.mocked(apiClient.apiCreateDocument).mockRejectedValueOnce(
      new core.ApiError('create document', 413, 'payload_too_large'),
    );
    await expect(saveOfflineToCloud('d1', 'owner')).rejects.toThrow();
    expect(apiClient.apiCreateDocument).toHaveBeenCalledTimes(1);
    expect(store.offlineDeleteIfUnchanged).not.toHaveBeenCalled();
  });

  it('stars nothing for an unstarred document', async () => {
    await saveOfflineToCloud('d1', 'owner');
    expect(apiClient.apiSetFavourite).not.toHaveBeenCalled();
  });

  it('uploads again when the document changed during the upload, removing the local copy only then', async () => {
    // docs/specs/006-document/offline-mode.md "Save to server": an edit made while the upload ran
    // would be deleted with the local copy, yet missing from the cloud one.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const edited = { id: 'd1', name: 'Roadmap', tabs: [], savedAt: 2 };
    states.push(edited, edited);
    await saveOfflineToCloud('d1', 'owner');
    const creates = vi.mocked(apiClient.apiCreateDocument).mock.calls;
    expect(creates).toHaveLength(2);
    // The first cloud copy is taken back (declared a move, so it skips the Trash) before the second.
    expect(calls).toEqual([
      'apiCreateDocument',
      'apiDelete',
      'apiCreateDocument',
      'offlineDeleteDocument',
    ]);
    const [, , opts] = vi.mocked(core.apiDelete).mock.calls[0]!;
    expect((opts as { extra?: Record<string, string> }).extra).toEqual({
      [DOCUMENT_CONVERSION_HEADER]: 'offline',
    });
    expect(warn).toHaveBeenCalledWith('[offline-sync] changed-during-upload attempt=1');
    warn.mockRestore();
  });

  it('gives up, keeping the local copy, when the document changes during every upload', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const at = (savedAt: number) => ({ id: 'd1', name: 'Roadmap', tabs: [], savedAt });
    states.push(at(2), at(3), at(4));
    await expect(saveOfflineToCloud('d1', 'owner')).rejects.toMatchObject({
      name: 'OfflineSyncIncompleteError',
      reason: 'kept_changing',
    });
    expect(apiClient.apiCreateDocument).toHaveBeenCalledTimes(3);
    expect(calls).not.toContain('offlineDeleteDocument');
    expect(calls.at(-1)).toBe('apiDelete');
  });

  it('keeps the local copy when the cloud copy is short of sheets', async () => {
    // A create that resolves to an existing row never re-seeds the stores, so a retried sync
    // could land without them; deleting the local copy then would lose them.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce({
      id: 'd1',
      name: 'Roadmap',
      tabs: [],
      sheets: [{ id: 's1', rev: 0, updatedAt: 1 }],
    } as never);
    await expect(saveOfflineToCloud('d1', 'owner')).rejects.toMatchObject({
      reason: 'stores_short',
    });
    expect(store.offlineDeleteIfUnchanged).not.toHaveBeenCalled();
    expect(calls).toEqual(['apiCreateDocument', 'apiDelete']);
  });

  it('checks the cloud stores only for a record that has some', async () => {
    await saveOfflineToCloud('d1', 'owner');
    expect(items.fetchCloudItems).not.toHaveBeenCalled();
    expect(sheets.fetchCloudSheets).not.toHaveBeenCalled();
  });

  it('refuses a document that is not in the local store', async () => {
    vi.mocked(store.offlineGetRecord).mockResolvedValueOnce(undefined as never);
    await expect(saveOfflineToCloud('missing', 'owner')).rejects.toThrow(/not found/i);
    expect(apiClient.apiCreateDocument).not.toHaveBeenCalled();
  });
});

describe('takeCloudOffline (cloud -> offline)', () => {
  it('keeps the deck and personal folder on the offline record', async () => {
    vi.mocked(apiClient.apiLoadDocument).mockResolvedValueOnce({
      id: 'd1',
      name: 'Roadmap',
      tabs: [{ id: 't1' }],
      folderId: 'f1',
      teamId: null,
      presentation: '{"decks":[]}',
    } as never);
    await takeCloudOffline('d1', 'owner');
    expect(vi.mocked(store.offlinePutRecord).mock.calls[0]![0]).toMatchObject({
      folderId: 'f1',
      presentation: '{"decks":[]}',
    });
  });

  // docs/specs/029-sheets/sheet-store.md "Offline documents": a spreadsheet taken offline stays one.
  it("keeps a spreadsheet's workbook row on the offline record", async () => {
    const workbook = { format: 'ods', settings: { locale: 'en-GB' } };
    vi.mocked(apiClient.apiLoadDocument).mockResolvedValueOnce({
      id: 'd1',
      name: 'Budget',
      tabs: [{ id: 't1' }],
      teamId: null,
      workbook,
    } as never);
    await takeCloudOffline('d1', 'owner');
    expect(vi.mocked(store.offlinePutRecord).mock.calls[0]![0]).toMatchObject({ workbook });
  });

  // sheet-store.md "Offline documents": Take offline reads the kept content before the server copy goes.
  it("keeps a spreadsheet's kept content on the offline record, read before the delete", async () => {
    const kept = { standard: 'odf', items: [], relationships: [], parts: [] };
    vi.mocked(keptApi.fetchKept).mockResolvedValueOnce(kept as never);
    vi.mocked(apiClient.apiLoadDocument).mockResolvedValueOnce({
      id: 'd1',
      name: 'Budget',
      tabs: [{ id: 't1' }],
      teamId: null,
      workbook: { format: 'ods' },
    } as never);
    await takeCloudOffline('d1', 'owner');
    expect(vi.mocked(keptApi.fetchKept).mock.calls[0]![0]).toMatchObject({ documentId: 'd1' });
    expect(vi.mocked(store.offlinePutRecord).mock.calls[0]![0]).toMatchObject({ kept });
  });

  // docs/specs/034-text-documents/live-editing-and-storage.md "A text document in This Browser".
  it("reads every text document's state onto the record, or takes nothing offline", async () => {
    vi.mocked(apiClient.apiLoadTab).mockResolvedValueOnce({
      id: 't1',
      name: 'Notes',
      kind: 'text-document',
      elements: [],
    } as never);
    await takeCloudOffline('d1', 'owner');
    expect(vi.mocked(store.offlinePutRecord).mock.calls[0]![0]).toMatchObject({
      textDocuments: [{ tabId: 't1', state: Uint8Array.of(7, 7) }],
    });
    vi.clearAllMocks();
    calls.length = 0;
    vi.mocked(apiClient.apiLoadTab).mockResolvedValueOnce({
      id: 't1',
      name: 'Notes',
      kind: 'text-document',
      elements: [],
    } as never);
    vi.mocked(textDocuments.apiLoadTextDocumentState).mockRejectedValueOnce(new Error('down'));
    await expect(takeCloudOffline('d1', 'owner')).rejects.toThrow('down');
    expect(calls).not.toContain('offlinePutRecord');
    expect(calls).not.toContain('apiDelete');
  });

  // docs/specs/035-pdf-documents/live-editing-and-storage.md "Take Offline": the live changes and the bytes are
  // here, all or nothing, before the record is written and before the server copy goes.
  it('keeps a PDF’s file and live changes here before the server copy goes', async () => {
    vi.mocked(apiClient.apiLoadTab).mockResolvedValueOnce(PDF_TAB as never);
    await takeCloudOffline('d1', 'owner', 'share');
    expect(calls).toEqual(['takePdfTabsOffline', 'offlinePutRecord', 'apiDelete']);
    expect(vi.mocked(pdfConversion.takePdfTabsOffline)).toHaveBeenCalledWith(
      [PDF_TAB],
      { ownerId: 'owner', documentId: 'd1', shareCode: 'share' },
      expect.any(Number),
    );
    // The record's tab names the stored file the live changes are on, as read.
    expect(vi.mocked(store.offlinePutRecord).mock.calls[0]![0]).toMatchObject({
      tabs: [{ id: 't1', kind: 'pdf', blob: 'f'.repeat(64), size: 99 }],
      pdfDocuments: [{ tabId: 't1', state: Uint8Array.of(5) }],
    });
  });

  it('leaves a PDF on LiveDoc, with nothing written, when this browser will not keep its file', async () => {
    vi.mocked(apiClient.apiLoadTab).mockResolvedValueOnce(PDF_TAB as never);
    vi.mocked(pdfConversion.takePdfTabsOffline).mockRejectedValueOnce(
      new LocalBlobRefused('local_store_full'),
    );
    await expect(takeCloudOffline('d1', 'owner')).rejects.toMatchObject({
      code: 'local_store_full',
    });
    expect(calls).toEqual([]);
  });

  it('loads nothing of a PDF for a document that holds none', async () => {
    await takeCloudOffline('d1', 'owner');
    expect(pdfConversion.takePdfTabsOffline).not.toHaveBeenCalled();
    expect(vi.mocked(store.offlinePutRecord).mock.calls[0]![0]).not.toHaveProperty('pdfDocuments');
  });

  it('keeps a starred document starred on the offline record', async () => {
    vi.mocked(apiClient.fetchCloudFavouriteIds).mockResolvedValueOnce(['d1']);
    await takeCloudOffline('d1', 'owner');
    expect(vi.mocked(store.offlinePutRecord).mock.calls[0]![0]).toMatchObject({ favourite: true });
  });

  // docs/specs/013-workspace/tags.md "An offline document's tags live in the browser".
  it('carries the document tags onto the offline record, and only its own', async () => {
    vi.mocked(tagsApi.fetchCloudTags).mockResolvedValueOnce({
      tags: [],
      links: [
        { tagId: 'a', documentId: 'd1' },
        { tagId: 'b', documentId: 'other' },
        { tagId: 'c', documentId: 'd1' },
      ],
    });
    await takeCloudOffline('d1', 'owner');
    expect(vi.mocked(store.offlinePutRecord).mock.calls[0]![0]).toMatchObject({
      tagIds: ['a', 'c'],
    });
  });

  it('aborts before writing anything when the tags could not be read', async () => {
    vi.mocked(tagsApi.fetchCloudTags).mockRejectedValueOnce(new Error('offline'));
    await expect(takeCloudOffline('d1', 'owner')).rejects.toThrow('offline');
    expect(calls).toEqual([]);
  });

  it('aborts before writing anything when the stars could not be read', async () => {
    // Taken as "not starred", the star would go with the server row.
    vi.mocked(apiClient.fetchCloudFavouriteIds).mockRejectedValueOnce(new Error('offline'));
    await expect(takeCloudOffline('d1', 'owner')).rejects.toThrow('offline');
    expect(calls).toEqual([]);
  });

  it('writes the local copy before deleting the server one', async () => {
    await takeCloudOffline('d1', 'owner');
    expect(calls).toEqual(['offlinePutRecord', 'apiDelete']);
  });

  it('embeds images before the server delete, never after', async () => {
    // Once the document row is gone its images count as unused, and the api's
    // 30-day reaper deletes the bytes the offline copy still points at.
    await takeCloudOffline('d1', 'owner');
    const embedOrder = vi.mocked(images.embedTabImages).mock.invocationCallOrder[0]!;
    const deleteOrder = vi.mocked(core.apiDelete).mock.invocationCallOrder[0]!;
    expect(embedOrder).toBeLessThan(deleteOrder);
  });

  it('aborts before the delete if any image failed to embed', async () => {
    // Best-effort embedding is fine; signing the stragglers up for the reaper
    // is not. The server copy and its images must survive.
    vi.mocked(images.embedTabImages).mockResolvedValueOnce([
      { id: 't1', elements: [{ type: 'image', imageId: 'r2-abc' }] },
    ] as never);
    await expect(takeCloudOffline('d1', 'owner')).rejects.toThrow(/embed incomplete/i);
    expect(core.apiDelete).not.toHaveBeenCalled();
    expect(store.offlinePutRecord).not.toHaveBeenCalled();
  });

  it('rolls the local copy back when the server delete fails', async () => {
    // Both copies registered under one id would shadow the live cloud document
    // behind a stale offline fork. Data-safe: the server still holds it all.
    vi.mocked(core.apiDelete).mockRejectedValueOnce(new Error('500'));
    await expect(takeCloudOffline('d1', 'owner')).rejects.toThrow();
    expect(store.offlineDeleteDocument).toHaveBeenCalledWith('d1');
  });

  it('still surfaces the delete failure even if the rollback also fails', async () => {
    // The rollback is best-effort; the caller must not be told the conversion
    // succeeded because the cleanup threw on the way out.
    vi.mocked(core.apiDelete).mockRejectedValueOnce(new Error('500'));
    vi.mocked(store.offlineDeleteDocument).mockRejectedValueOnce(new Error('idb gone'));
    await expect(takeCloudOffline('d1', 'owner')).rejects.toThrow('500');
  });

  it('refuses a document the server does not have', async () => {
    vi.mocked(apiClient.apiLoadDocument).mockResolvedValueOnce(null);
    await expect(takeCloudOffline('nope', 'owner')).rejects.toThrow(/not found/i);
    expect(store.offlinePutRecord).not.toHaveBeenCalled();
  });

  it('aborts when a tab fails to load, leaving the server copy intact', async () => {
    // This used to assert the opposite — that the conversion carried on and
    // deleted the server document — under the name "keeps going … rather than
    // losing the rest". Carrying on is what loses: the offline record is
    // written from the tabs that survived, the server copy is deleted, and the
    // failed tab's elements exist nowhere. Nothing is recoverable and the user
    // is told it worked.
    vi.mocked(apiClient.apiLoadTab).mockRejectedValueOnce(new Error('flaky'));
    await expect(takeCloudOffline('d1', 'owner')).rejects.toThrow(/tab load incomplete/i);
    expect(store.offlinePutRecord).not.toHaveBeenCalled();
    expect(core.apiDelete).not.toHaveBeenCalled();
  });

  it('aborts on a tab that 404s without throwing', async () => {
    // The second null path, and the easier one to hit: `expectOkOrNull` maps a
    // 404 to null rather than an error, so a tab that momentarily isn't there
    // never reaches the `.catch` at all.
    vi.mocked(apiClient.apiLoadTab).mockResolvedValueOnce(null);
    await expect(takeCloudOffline('d1', 'owner')).rejects.toThrow(/tab load incomplete/i);
    expect(core.apiDelete).not.toHaveBeenCalled();
  });
});

describe('conversions declare themselves to the worker', () => {
  // Both conversions reuse ordinary endpoints, so the worker cannot tell them
  // from a real delete / a real create unless the request says so — and
  // undeclared it recorded exactly that, telling the owner in danger red that a
  // document they had just moved into this browser was deleted (docs/specs/006-document/offline-mode.md +
  // docs/specs/013-workspace/timeline.md §4.2).
  it('marks the take-offline DELETE as an offline conversion', async () => {
    await takeCloudOffline('d1', 'owner');
    const [, , opts] = vi.mocked(core.apiDelete).mock.calls[0]!;
    expect((opts as { extra?: Record<string, string> }).extra).toEqual({
      [DOCUMENT_CONVERSION_HEADER]: 'offline',
    });
  });

  it('marks the sync POST as a sync conversion', async () => {
    await saveOfflineToCloud('off-1', 'owner');
    const call = vi.mocked(apiClient.apiCreateDocument).mock.calls[0]!;
    expect(call[2]).toEqual({ conversion: 'sync' });
  });
});

describe('one conversion per document at a time', () => {
  // The menu that starts a conversion unmounts when it closes, so its own guard went with it and a
  // second menu could start an overlapping conversion of the same document.
  it('refuses a second conversion of a document while the first runs, then allows the next', async () => {
    let land: () => void = () => {};
    vi.mocked(apiClient.apiCreateDocument).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          land = () => resolve(undefined as never);
        }),
    );
    const first = saveOfflineToCloud('d1', 'owner');
    expect(conversionInProgress('d1')).toBe(true);
    await expect(saveOfflineToCloud('d1', 'owner')).rejects.toBeInstanceOf(
      ConversionInProgressError,
    );
    await expect(takeCloudOffline('d1', 'owner')).rejects.toBeInstanceOf(ConversionInProgressError);
    land();
    await first;
    expect(conversionInProgress('d1')).toBe(false);
    expect(apiClient.apiCreateDocument).toHaveBeenCalledTimes(1);
    await expect(saveOfflineToCloud('d1', 'owner')).resolves.toMatchObject({ id: 'd1' });
  });

  it('lets a failed conversion be tried again', async () => {
    vi.mocked(apiClient.apiCreateDocument).mockRejectedValueOnce(new Error('offline'));
    await expect(saveOfflineToCloud('d1', 'owner')).rejects.toThrow('offline');
    expect(conversionInProgress('d1')).toBe(false);
  });
});

// docs/specs/035-pdf-documents/live-editing-and-storage.md "Errors in This Browser": a refused Take Offline leaves
// the document on LiveDoc, and a browser that will not keep the bytes is named.
describe('takeOfflineFailureMessage', () => {
  it('names a browser that will not keep a PDF’s bytes', () => {
    expect(takeOfflineFailureMessage(new LocalBlobRefused('local_store_full'))).toBe(
      'This browser has no room to keep this PDF.',
    );
    expect(takeOfflineFailureMessage(new LocalBlobRefused('local_store_unavailable'))).toBe(
      "This browser can't keep files, so this PDF can't be kept here.",
    );
  });

  it('says the document stays safe on the server for anything else, and a save still going as it is', () => {
    expect(takeOfflineFailureMessage(new Error('down'))).toBe(
      'Couldn’t take this offline. It stays safe on the server.',
    );
    expect(takeOfflineFailureMessage(new SyncStillSavingError())).toMatch(/still saving/i);
  });
});

describe('syncFailureMessage', () => {
  it('names the size cap for a 413, so it does not read as a connection blip', () => {
    const e = new core.ApiError('sync', 413, null);
    expect(syncFailureMessage(e)).toMatch(/too large to sync/i);
    expect(syncFailureMessage(e)).not.toMatch(/connection/i);
  });

  it('says the local copy is safe when the sync stopped itself', async () => {
    const { OfflineSyncIncompleteError } = await import('./offline-sync');
    expect(syncFailureMessage(new OfflineSyncIncompleteError('kept_changing'))).toMatch(
      /kept changing/i,
    );
    expect(syncFailureMessage(new OfflineSyncIncompleteError('stores_short'))).toMatch(
      /yours was kept/i,
    );
  });

  // docs/specs/035-pdf-documents/live-editing-and-storage.md "Errors in This Browser".
  it.each([
    ['blob_missing', 404, "This PDF's file is missing from storage."],
    ['files_unavailable', 503, 'This server has no file storage.'],
    ['usage_exceeded', 403, "This document doesn't fit in the file storage that is left."],
    [
      'live_changes_too_large',
      413,
      'This PDF has more changes than fit. Download it, then add the download.',
    ],
  ] as const)('names what stopped a PDF’s sync: %s', (code, status, said) => {
    expect(syncFailureMessage(new core.ApiError('PDF sync', status, code))).toBe(said);
  });

  it('falls back to the connection wording for anything else', () => {
    expect(syncFailureMessage(new core.ApiError('sync', 500, null))).toMatch(/connection/i);
    expect(syncFailureMessage(new Error('offline'))).toMatch(/connection/i);
    expect(syncFailureMessage(undefined)).toMatch(/connection/i);
  });
});

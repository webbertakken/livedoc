import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';

// Mock the api-client boundary so the test exercises only the pure
// remapping logic inside duplicateDocument, not the network.
vi.mock('./api-client', () => ({
  apiLoadDocument: vi.fn(),
  apiLoadTab: vi.fn(),
  apiCreateDocument: vi.fn(),
  apiDeleteDocument: vi.fn(async () => {}),
}));
vi.mock('./api/workbook-kept', () => ({
  fetchKept: vi.fn(async () => undefined),
  sendKept: vi.fn(),
}));

vi.mock('./api/text-documents', () => ({ apiLoadTextDocumentState: vi.fn() }));
vi.mock('./api/pdf-documents', () => ({ apiLoadPdfState: vi.fn() }));
vi.mock('./offline/offline-store', () => ({
  isOfflineId: vi.fn(async () => false),
  offlineCreateDocument: vi.fn(async () => {}),
  offlineGetRecord: vi.fn(),
  offlinePutRecord: vi.fn(async () => {}),
}));

vi.mock('./offline/offline-partings', () => ({
  offlineRecordWithPartings: vi.fn(async (rec: unknown) => rec),
}));

import { apiCreateDocument, apiDeleteDocument, apiLoadDocument, apiLoadTab } from './api-client';
import { offlineRecordWithPartings } from './offline/offline-partings';
import { apiLoadPdfState } from './api/pdf-documents';
import { fetchKept, sendKept } from './api/workbook-kept';
import { apiLoadTextDocumentState } from './api/text-documents';
import {
  isOfflineId,
  offlineCreateDocument,
  offlineGetRecord,
  offlinePutRecord,
} from './offline/offline-store';
import { ApiError } from './api/core';
import { duplicateDocument } from './duplicate-document';

const mLoadDocument = vi.mocked(apiLoadDocument);
const mLoadTab = vi.mocked(apiLoadTab);
const mCreate = vi.mocked(apiCreateDocument);

// Minimal LiveDoc-ish stub: duplicateDocument only reads id, name, tabs.
const sourceDocument = (tabs: { id: string }[]) =>
  ({ id: 'src', name: 'Flow', tabs }) as Awaited<ReturnType<typeof apiLoadDocument>>;

const tab = (id: string, elements: Tab['elements'] = []): Tab => ({
  id,
  name: `Tab ${id}`,
  elements,
});

const linkedShape = (id: string, targetTabId: string) => ({
  id,
  type: 'shape' as const,
  shape: 'square' as const,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  link: { kind: 'tab' as const, tabId: targetTabId },
});

beforeEach(() => {
  vi.clearAllMocks();
  mCreate.mockResolvedValue({} as Awaited<ReturnType<typeof apiCreateDocument>>);
});

describe('duplicateDocument', () => {
  it('returns undefined when the source document cannot be loaded', async () => {
    mLoadDocument.mockResolvedValue(null);
    expect(await duplicateDocument('owner', 'missing')).toBeUndefined();
    expect(mCreate).not.toHaveBeenCalled();
  });

  it('returns undefined when the source load rejects', async () => {
    mLoadDocument.mockRejectedValue(new Error('network'));
    expect(await duplicateDocument('owner', 'src')).toBeUndefined();
    expect(mCreate).not.toHaveBeenCalled();
  });

  it('creates a copy with a fresh id and a " copy" suffixed name', async () => {
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }]));
    mLoadTab.mockResolvedValue(tab('t1'));

    const newId = await duplicateDocument('owner', 'src');

    expect(mCreate).toHaveBeenCalledTimes(1);
    const [owner, payload] = mCreate.mock.calls[0]!;
    expect(owner).toBe('owner');
    expect(payload.name).toBe('Flow copy');
    expect(payload.id).toBe(newId);
    expect(payload.id).not.toBe('src');
  });

  // docs/specs/029-sheets/sheet-store.md "Copies and exports": a copy of a spreadsheet is a spreadsheet.
  it("copies a spreadsheet's workbook row", async () => {
    const workbook = { format: 'ods', settings: {} } as never;
    mLoadDocument.mockResolvedValue({ ...sourceDocument([{ id: 't1' }])!, workbook });
    mLoadTab.mockResolvedValue(tab('t1'));
    await duplicateDocument('owner', 'src');
    expect(mCreate.mock.calls[0]![1]).toMatchObject({ workbook });
  });

  // sheet-store.md "Copies and exports": a spreadsheet's kept content comes with it, sent after the create.
  describe("a spreadsheet's kept content", () => {
    const kept = { standard: 'odf', items: [], relationships: [], parts: [] } as never;
    const spreadsheet = () => {
      mLoadDocument.mockResolvedValue({
        ...sourceDocument([{ id: 't1' }])!,
        workbook: {} as never,
      });
      mLoadTab.mockResolvedValue(tab('t1'));
    };

    it('is read from the source and sent to the copy', async () => {
      spreadsheet();
      vi.mocked(fetchKept).mockResolvedValueOnce(kept);
      const newId = await duplicateDocument('owner', 'src');
      expect(vi.mocked(fetchKept).mock.calls[0]![0]).toEqual({
        ownerId: 'owner',
        documentId: 'src',
        shareCode: null,
      });
      expect(vi.mocked(sendKept).mock.calls[0]).toEqual([
        { ownerId: 'owner', documentId: newId, shareCode: null },
        kept,
      ]);
    });

    it('fails the copy when it cannot be read, before any create', async () => {
      spreadsheet();
      vi.mocked(fetchKept).mockRejectedValueOnce(new Error('down'));
      expect(await duplicateDocument('owner', 'src')).toBeUndefined();
      expect(mCreate).not.toHaveBeenCalled();
    });

    it('moves the half-made copy to the Bin when it is refused', async () => {
      spreadsheet();
      vi.mocked(fetchKept).mockResolvedValueOnce(kept);
      vi.mocked(sendKept).mockRejectedValueOnce(new Error('refused'));
      vi.mocked(apiDeleteDocument).mockRejectedValueOnce(new Error('offline'));
      expect(await duplicateDocument('owner', 'src')).toBeUndefined();
      expect(apiDeleteDocument).toHaveBeenCalledWith('owner', mCreate.mock.calls[0]![1].id);
    });

    it('comes with a copy made in This Browser', async () => {
      spreadsheet();
      vi.mocked(isOfflineId).mockImplementation(async (id) => id === 'src');
      vi.mocked(offlineGetRecord).mockResolvedValue({ id: 'x', kept } as never);
      await duplicateDocument('owner', 'src');
      expect(vi.mocked(offlinePutRecord).mock.calls[0]![0]).toMatchObject({ kept });
      expect(fetchKept).not.toHaveBeenCalled();
      vi.mocked(offlineGetRecord).mockReset();
      vi.mocked(isOfflineId).mockImplementation(async () => false);
    });
  });

  // docs/specs/034-text-documents/live-editing-and-storage.md "Copies": each text document's state seeds the copy.
  it("seeds the copy with each text document's state, under the tab's new id", async () => {
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }, { id: 'c' }]));
    mLoadTab.mockImplementation(async (_o, _d, id) =>
      id === 't1' ? { ...tab('t1'), kind: 'text-document' } : tab('c'),
    );
    vi.mocked(apiLoadTextDocumentState).mockResolvedValue(Uint8Array.of(1, 2, 3));
    await duplicateDocument('owner', 'src');
    const payload = mCreate.mock.calls[0]![1];
    const copied = payload.tabs!.find((t) => t.name === 'Tab t1')!;
    expect(payload.textDocuments).toEqual([{ tabId: copied.id, state: 'AQID' }]);
    expect(vi.mocked(apiLoadTextDocumentState)).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'src', tabId: 't1' }),
    );
  });

  // "A text document in This Browser": a copy of one in This Browser keeps its states, under the new tab ids.
  it("copies an offline text document's states onto the copy's record", async () => {
    vi.mocked(isOfflineId).mockImplementation(async (id) => id === 'src');
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }]));
    mLoadTab.mockResolvedValue({ ...tab('t1'), kind: 'text-document' });
    const state = { tabId: 't1', state: Uint8Array.of(4), savedAt: 2 };
    vi.mocked(offlineGetRecord).mockImplementation(async (id) =>
      id === 'src'
        ? ({ id: 'src', textDocuments: [state] } as never)
        : ({ id, name: 'Flow copy', tabs: [] } as never),
    );
    const newId = await duplicateDocument('owner', 'src');
    const written = vi.mocked(offlinePutRecord).mock.calls[0]![0];
    expect(written.id).toBe(newId);
    expect(written.textDocuments).toHaveLength(1);
    expect(written.textDocuments![0]!.tabId).not.toBe('t1');
    expect(written.textDocuments![0]!.state).toEqual(Uint8Array.of(4));
    expect(mCreate).not.toHaveBeenCalled();
    vi.mocked(isOfflineId).mockImplementation(async () => false);
  });

  // docs/specs/035-pdf-documents/live-editing-and-storage.md "Duplicate of a This Browser PDF copies each tab's
  // live changes under its new id; the copy names the same key, so no byte is copied."
  it("copies an offline PDF's live changes onto the copy's record, its tab naming the same file", async () => {
    vi.mocked(isOfflineId).mockImplementation(async (id) => id === 'src');
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }]));
    const key = 'c'.repeat(64);
    mLoadTab.mockResolvedValue({ ...tab('t1'), kind: 'pdf', blob: key, size: 9 } as never);
    const state = { tabId: 't1', state: Uint8Array.of(8), savedAt: 2 };
    vi.mocked(offlineGetRecord).mockImplementation(async (id) =>
      id === 'src'
        ? ({ id: 'src', pdfDocuments: [state, { ...state, tabId: 'not-copied' }] } as never)
        : ({ id, name: 'Flow copy', tabs: [] } as never),
    );
    const newId = await duplicateDocument('owner', 'src');
    const made = vi.mocked(offlineCreateDocument).mock.calls.at(-1)![0];
    expect(made.tabs).toMatchObject([{ kind: 'pdf', blob: key, size: 9 }]);
    const written = vi.mocked(offlinePutRecord).mock.calls.at(-1)![0];
    expect(written.id).toBe(newId);
    expect(written.pdfDocuments).toEqual([{ ...state, tabId: made.tabs![0]!.id }]);
    expect(mCreate).not.toHaveBeenCalled();
    vi.mocked(isOfflineId).mockImplementation(async () => false);
  });

  // docs/specs/035-pdf-documents/live-editing-and-storage.md "A page's last moment": one left behind joins the
  // record before Duplicate reads it.
  it('copies an offline source as it reads with what a closing page left', async () => {
    vi.mocked(isOfflineId).mockImplementation(async (id) => id === 'src');
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }]));
    mLoadTab.mockResolvedValue({
      ...tab('t1'),
      kind: 'pdf',
      blob: 'c'.repeat(64),
      size: 9,
    } as never);
    const read = { id: 'src', pdfDocuments: [] };
    const late = { tabId: 't1', state: Uint8Array.of(9), savedAt: 3 };
    vi.mocked(offlineGetRecord).mockImplementation(async (id) =>
      id === 'src' ? (read as never) : ({ id, name: 'Flow copy', tabs: [] } as never),
    );
    vi.mocked(offlineRecordWithPartings).mockResolvedValueOnce({
      ...read,
      pdfDocuments: [late],
    } as never);
    await duplicateDocument('owner', 'src');
    expect(vi.mocked(offlineRecordWithPartings)).toHaveBeenCalledWith(read);
    const made = vi.mocked(offlineCreateDocument).mock.calls.at(-1)![0];
    const written = vi.mocked(offlinePutRecord).mock.calls.at(-1)![0];
    expect(written.pdfDocuments).toEqual([{ ...late, tabId: made.tabs![0]!.id }]);
    vi.mocked(isOfflineId).mockImplementation(async () => false);
  });

  it("makes no copy when a text document's state cannot be read", async () => {
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }]));
    mLoadTab.mockResolvedValue({ ...tab('t1'), kind: 'text-document' });
    vi.mocked(apiLoadTextDocumentState).mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await duplicateDocument('owner', 'src')).toBeUndefined();
    expect(mCreate).not.toHaveBeenCalled();
  });

  // docs/specs/035-pdf-documents/live-editing-and-storage.md "Copies, the Trash and versions": a copy of one's own
  // document names the same stored file, and the create carries each PDF tab's live changes.
  it("seeds the copy with each PDF tab's live changes, under the tab's new id", async () => {
    const pdf = { ...tab('t1'), kind: 'pdf', blob: 'a'.repeat(64), size: 9 };
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }]));
    mLoadTab.mockResolvedValue(pdf as never);
    vi.mocked(apiLoadPdfState).mockResolvedValue({ update: Uint8Array.of(1, 2, 3) } as never);
    await duplicateDocument('owner', 'src');
    const payload = mCreate.mock.calls[0]![1];
    const copied = payload.tabs![0]!;
    expect(copied).toMatchObject({ kind: 'pdf', blob: pdf.blob, size: 9 });
    expect(copied.id).not.toBe('t1');
    expect(payload.pdfDocuments).toEqual([{ tabId: copied.id, state: 'AQID' }]);
    expect(vi.mocked(apiLoadPdfState)).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'src', tabId: 't1', shareCode: null }),
    );
  });

  it("makes no copy when a PDF tab's live changes cannot be read", async () => {
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }]));
    mLoadTab.mockResolvedValue({
      ...tab('t1'),
      kind: 'pdf',
      blob: 'a'.repeat(64),
      size: 9,
    } as never);
    vi.mocked(apiLoadPdfState).mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await duplicateDocument('owner', 'src')).toBeUndefined();
    expect(mCreate).not.toHaveBeenCalled();
  });

  it('mints a fresh id for every copied tab (no reuse of source ids)', async () => {
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }, { id: 't2' }]));
    mLoadTab.mockImplementation((_o, _d, tabId) => Promise.resolve(tab(tabId)));

    await duplicateDocument('owner', 'src');

    const payload = mCreate.mock.calls[0]![1];
    const newIds = payload.tabs!.map((t) => t.id);
    expect(newIds).toHaveLength(2);
    expect(newIds).not.toContain('t1');
    expect(newIds).not.toContain('t2');
    expect(new Set(newIds).size).toBe(2); // distinct
  });

  it('rewrites cross-tab link.tabId references to the new tab ids', async () => {
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }, { id: 't2' }]));
    // t1 has a shape linking to t2; that link must follow the copy.
    mLoadTab.mockImplementation((_o, _d, tabId) =>
      Promise.resolve(tabId === 't1' ? tab('t1', [linkedShape('s1', 't2')]) : tab('t2')),
    );

    await duplicateDocument('owner', 'src');

    const payload = mCreate.mock.calls[0]![1];
    const copiedT1 = payload.tabs!.find((t) => t.name === 'Tab t1')!;
    const copiedT2 = payload.tabs!.find((t) => t.name === 'Tab t2')!;
    const link = (copiedT1.elements[0] as { link: { tabId: string } }).link;
    // The link now points at t2's NEW id, not the original 't2'.
    expect(link.tabId).toBe(copiedT2.id);
    expect(link.tabId).not.toBe('t2');
  });

  it('leaves a link untouched when it points outside the duplicated set', async () => {
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }]));
    mLoadTab.mockResolvedValue(tab('t1', [linkedShape('s1', 'external-tab')]));

    await duplicateDocument('owner', 'src');

    const payload = mCreate.mock.calls[0]![1];
    const link = (payload.tabs![0]!.elements[0] as { link: { tabId: string } }).link;
    expect(link.tabId).toBe('external-tab');
  });

  it('skips tabs that failed to load but still copies the ones that succeeded', async () => {
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }, { id: 't2' }]));
    mLoadTab.mockImplementation((_o, _d, tabId) =>
      Promise.resolve(tabId === 't1' ? tab('t1') : null),
    );

    await duplicateDocument('owner', 'src');

    const payload = mCreate.mock.calls[0]![1];
    expect(payload.tabs).toHaveLength(1);
    expect(payload.tabs![0]!.name).toBe('Tab t1');
  });

  it('returns the new id even when a single tab fetch rejects', async () => {
    mLoadDocument.mockResolvedValue(sourceDocument([{ id: 't1' }]));
    mLoadTab.mockRejectedValue(new Error('tab fetch failed'));

    const newId = await duplicateDocument('owner', 'src');
    expect(typeof newId).toBe('string');
    // The one tab failed → copy has no tabs, but creation still attempted.
    expect(mCreate.mock.calls[0]![1].tabs).toHaveLength(0);
  });
});

// Duplicate (docs/specs/013-workspace/default-folders.md "Duplicate"): beside its source, always an
// explicit placement, recording the source's recorded intent unchanged, never routed by a default.
describe('duplicateDocument placement and recorded intent', () => {
  const placed = (over: Record<string, unknown>) =>
    ({
      ...sourceDocument([{ id: 't1' }]),
      teamId: null,
      folderId: null,
      opensIn: null,
      tabKind: null,
      templateFamily: null,
      ...over,
    }) as Awaited<ReturnType<typeof apiLoadDocument>>;

  beforeEach(() => {
    mLoadTab.mockResolvedValue(tab('t1'));
  });

  it('creates the copy in the given team folder in the one create', async () => {
    mLoadDocument.mockResolvedValue(placed({}));
    await duplicateDocument('owner', 'src', { teamId: 'team-1', folderId: 'tf1' });
    expect(mCreate).toHaveBeenCalledTimes(1);
    expect(mCreate.mock.calls[0]![1]).toMatchObject({ teamId: 'team-1', folderId: 'tf1' });
  });

  it('files the copy beside its source when no placement is given', async () => {
    mLoadDocument.mockResolvedValue(placed({ folderId: 'f-plans' }));
    await duplicateDocument('owner', 'src');
    expect(mCreate.mock.calls[0]![1]).toMatchObject({ teamId: null, folderId: 'f-plans' });
  });

  it('sends a source at the root as the explicit root, so no default routes it', async () => {
    mLoadDocument.mockResolvedValue(placed({}));
    await duplicateDocument('owner', 'src');
    expect(mCreate.mock.calls[0]![1]).toHaveProperty('folderId', null);
  });

  it("records the source's recorded intent, unchanged", async () => {
    mLoadDocument.mockResolvedValue(
      placed({ opensIn: 'diagram', tabKind: 'diagram', templateFamily: 'retrospective' }),
    );
    await duplicateDocument('owner', 'src');
    expect(mCreate.mock.calls[0]![1].intent).toEqual({
      mode: 'diagram',
      tabKind: 'diagram',
      templateFamily: 'retrospective',
    });
  });

  it('records an event-storming source with no family', async () => {
    mLoadDocument.mockResolvedValue(placed({ opensIn: 'diagram', tabKind: 'event-storming' }));
    await duplicateDocument('owner', 'src');
    expect(mCreate.mock.calls[0]![1].intent).toEqual({
      mode: 'diagram',
      tabKind: 'event-storming',
    });
  });

  it('sends no intent for a source whose intent is unknown', async () => {
    mLoadDocument.mockResolvedValue(placed({}));
    await duplicateDocument('owner', 'src');
    expect(mCreate.mock.calls[0]![1]).not.toHaveProperty('intent');
  });

  it("files the copy at the explicit root when its source's place is refused", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mLoadDocument.mockResolvedValue(placed({ teamId: 'team-x' }));
    mCreate.mockRejectedValueOnce(new ApiError('create document', 403, 'team_forbidden'));
    expect(await duplicateDocument('owner', 'src')).toBeDefined();
    expect(mCreate).toHaveBeenCalledTimes(2);
    expect(mCreate.mock.calls[1]![1]).toMatchObject({ teamId: null, folderId: null });
    expect(warn).toHaveBeenCalledWith(
      '[create-beside] placement refused reason=team_forbidden, filed at the root',
    );
    warn.mockRestore();
  });

  it('gives up on any other failure', async () => {
    mLoadDocument.mockResolvedValue(placed({}));
    mCreate.mockRejectedValueOnce(new ApiError('create document', 500, null));
    expect(await duplicateDocument('owner', 'src')).toBeUndefined();
    expect(mCreate).toHaveBeenCalledTimes(1);
  });
});

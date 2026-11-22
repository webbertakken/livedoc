import { WorkbookRecord } from '@livedoc/sheets';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveDoc } from '@livedoc/api-schema';

const apiLoadTab = vi.fn<typeof import('@/lib/api-client').apiLoadTabRevisioned>();
vi.mock('@/lib/api-client', () => ({
  apiLoadTabRevisioned: (...a: Parameters<typeof apiLoadTab>) => apiLoadTab(...a),
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
// The families' loads, settled by the test, so the gate's wait is seen.
const kinds = vi.hoisted(() => ({ hold: false, release: () => {}, asked: [] as unknown[][] }));
vi.mock('@/lib/element-kinds/load-for', () => ({
  loadKindFamiliesFor: (...args: unknown[]) => {
    kinds.asked.push(args);
    return kinds.hold
      ? new Promise<void>((resolve) => (kinds.release = resolve))
      : Promise.resolve();
  },
}));

// The canvas's code, settled by the test likewise.
const canvas = vi.hoisted(() => ({ hold: false, release: () => {}, asked: [] as unknown[][] }));
vi.mock('@/lib/canvas-code/canvas-code', () => ({
  loadCanvasCode: (...args: unknown[]) => {
    canvas.asked.push(args);
    return canvas.hold
      ? new Promise<boolean>((resolve) => (canvas.release = () => resolve(true)))
      : Promise.resolve(true);
  },
}));

import { makeSeedFetchedDocument } from './seed-fetched-document';

// The editor's eager first-tab read is the one that counts as an open of the document, for the
// reader's Home (docs/specs/013-workspace/explorer-home.md "Opens"); an embed is not an open.

const fetched = {
  id: 'd1',
  ownerId: 'owner',
  name: 'Payments',
  tabs: [{ id: 't1', documentId: 'd1', name: 'Tab 1', orderIndex: 0, updatedAt: 1 }],
  shareable: false,
  shareCode: null,
  folderId: null,
  teamId: null,
  source: null,
  presentation: null,
  savedAt: 1,
  createdAt: 1,
  ownerName: null,
  ownerColor: null,
  opensIn: null,
  tabKind: null,
  templateFamily: null,
} satisfies LiveDoc;

function seed(
  recordOpen: boolean,
  noteChangesetSeen = vi.fn(),
  setDocumentWorkbook = vi.fn(),
  resetTabs = vi.fn(),
) {
  const noop = vi.fn();
  return makeSeedFetchedDocument({
    activeId: 't1',
    recordOpen,
    resetTabs,
    lastSavedTabsRef: { current: [] },
    lastSavedNameRef: { current: '' },
    loadedTabIdsRef: { current: new Set() },
    noteChangesetSeen,
    setActiveId: noop,
    setDocumentName: noop,
    setDocumentPresentation: noop,
    setDocumentItemTypes: noop,
    setDocumentWorkbook,
    setDocumentOwnerColor: noop,
    setDocumentOwnerId: noop,
    setDocumentOwnerName: noop,
    setDocumentShareable: noop,
    setDocumentShareCode: noop,
    setDocumentTeamId: noop,
    setLoadedExistingDocument: noop,
    setLoadedTabIds: noop,
  });
}

beforeEach(() => {
  apiLoadTab.mockReset();
  apiLoadTab.mockResolvedValue({ tab: { id: 't1', name: 'Tab 1', elements: [] }, rev: 6 });
});

describe('seedFetchedDocument', () => {
  it("declares the editor's first-tab read an open", async () => {
    await seed(true)('me', fetched, 'CODE', null);
    expect(apiLoadTab).toHaveBeenCalledWith('me', 'd1', 't1', 'CODE', { open: true });
  });

  it('declares nothing for an embed', async () => {
    await seed(false)('me', fetched, 'CODE', null);
    expect(apiLoadTab).toHaveBeenCalledWith('me', 'd1', 't1', 'CODE', { open: false });
  });
});

// docs/specs/029-sheets/sheet-store.md "In a spreadsheet": the workbook record says the document is a spreadsheet.
describe('seedFetchedDocument and spreadsheets', () => {
  it('hands on the workbook record, and null for any other document', async () => {
    const workbook = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
    const set = vi.fn();
    await seed(true, vi.fn(), set)('me', { ...fetched, workbook }, 'CODE', null);
    expect(set).toHaveBeenLastCalledWith(workbook);
    await seed(true, vi.fn(), set)('me', fetched, 'CODE', null);
    expect(set).toHaveBeenLastCalledWith(null);
  });
});

// docs/specs/024-agents/agent-changesets.md "The editor": the first tab's load records what it holds.
describe('seedFetchedDocument and changesets', () => {
  it('records the first tab revision as seen', async () => {
    const noteChangesetSeen = vi.fn();
    await seed(true, noteChangesetSeen)('me', fetched, null, null);
    expect(noteChangesetSeen).toHaveBeenCalledWith('t1', 6);
  });
});

// docs/specs/016-platform/web-performance.md "The open is one read": the open read carried the first tab.
describe('seedFetchedDocument with the tab the open read carried', () => {
  it('seeds that tab and reads it no more', async () => {
    const noteChangesetSeen = vi.fn();
    const opened = { tab: { id: 't1', name: 'Tab 1', elements: [] }, rev: 9 };
    await seed(true, noteChangesetSeen)('me', fetched, null, null, opened);
    expect(apiLoadTab).not.toHaveBeenCalled();
    expect(noteChangesetSeen).toHaveBeenCalledWith('t1', 9);
  });

  it('reads the tab itself when the open read carried another one', async () => {
    const opened = { tab: { id: 't9', name: 'Other', elements: [] }, rev: 1 };
    await seed(true)('me', fetched, null, null, opened);
    expect(apiLoadTab).toHaveBeenCalledWith('me', 'd1', 't1', null, { open: true });
  });
});

// docs/specs/016-platform/web-performance.md "At the open": the board draws every element with its own face in its
// first frame, so the first tab is put in place only once its element kind families are in.
describe('seedFetchedDocument and element kind families', () => {
  it('puts the first tab in place once its families are in', async () => {
    const elements = [{ id: 'e1', type: 'shape', shape: 'reveal' }];
    apiLoadTab.mockResolvedValue({ tab: { id: 't1', name: 'Tab 1', elements }, rev: 1 } as never);
    const resetTabs = vi.fn();
    kinds.hold = true;
    kinds.asked.length = 0;
    const seeding = seed(true, vi.fn(), vi.fn(), resetTabs)('me', fetched, null, null);
    await vi.waitFor(() =>
      expect(kinds.asked).toEqual([[expect.objectContaining({ id: 't1', elements }), 'tab']]),
    );
    expect(resetTabs).not.toHaveBeenCalled();
    kinds.release();
    kinds.hold = false;
    await seeding;
    expect(resetTabs).toHaveBeenCalledTimes(1);
  });
});

// docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code": a board opened at the open waits for the
// canvas's code as it waits for its families; a tab with a surface never asks for it.
describe('seedFetchedDocument and the canvas’s code', () => {
  it('puts a canvas tab in place once the canvas’s code is in', async () => {
    const resetTabs = vi.fn();
    canvas.hold = true;
    canvas.asked.length = 0;
    const seeding = seed(true, vi.fn(), vi.fn(), resetTabs)('me', fetched, null, null);
    await vi.waitFor(() => expect(canvas.asked).toEqual([['open']]));
    expect(resetTabs).not.toHaveBeenCalled();
    canvas.release();
    canvas.hold = false;
    await seeding;
    expect(resetTabs).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a text document', { kind: 'text-document', format: 'odf' }],
    [
      'a PDF',
      {
        kind: 'pdf',
        blob: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        size: 1,
      },
    ],
  ])('never asks for it for %s tab', async (_, kind) => {
    apiLoadTab.mockResolvedValue({
      tab: { id: 't1', name: 'Tab 1', ...kind, elements: [] },
      rev: 1,
    } as never);
    canvas.asked.length = 0;
    await seed(true)('me', fetched, null, null);
    expect(canvas.asked).toEqual([]);
  });
});

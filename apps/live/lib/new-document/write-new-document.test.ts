import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';

const mocks = vi.hoisted(() => ({
  apiCreateDocument: vi.fn(async () => ({})),
  offlineCreateDocument: vi.fn(async () => ({})),
  offlineWriteItem: vi.fn(async () => ({})),
  track: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({ apiCreateDocument: mocks.apiCreateDocument }));
vi.mock('@/lib/offline/offline-store', () => ({
  offlineCreateDocument: mocks.offlineCreateDocument,
}));
vi.mock('@/lib/offline/offline-items', () => ({ offlineWriteItem: mocks.offlineWriteItem }));
vi.mock('@/lib/seed-author', () => ({ seedAuthor: async () => ({ id: 'p', name: 'P' }) }));
vi.mock('@/lib/template-sheets', () => ({
  withTemplateSheets: async (tabs: Tab[]) => ({ tabs, sheets: [] }),
  storedSheets: (creates: { id: string }[], now: number) =>
    creates.map((c) => ({ ...c, rev: 0, createdAt: now })),
}));
vi.mock('@/lib/telemetry', () => ({
  track: mocks.track,
  titleCaseType: (k: string) => `T:${k}`,
}));

import {
  trackNewDocumentCreated,
  writeNewDocument,
  type NewDocumentWrite,
} from './write-new-document';

const tab = { id: 't1', name: 'Tab 1', elements: [] } as unknown as Tab;
const write = (over: Partial<NewDocumentWrite> = {}): NewDocumentWrite => ({
  ids: { documentId: 'd1', tabId: 't1' },
  name: 'Untitled Diagram',
  templateKind: 'blank',
  content: { tabs: null, tab, itemTypes: null, seedItems: [] },
  location: 'livedoc',
  creator: vi.fn(async () => ({ id: 'owner-1', name: 'Pat', color: '#000' })),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('writeNewDocument', () => {
  it('creates a LiveDoc document as its creator, with its place and intent', async () => {
    await writeNewDocument(write({ folderId: 'f1', teamId: 'team-1' }));
    expect(mocks.apiCreateDocument).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({
        id: 'd1',
        name: 'Untitled Diagram',
        tabs: [tab],
        folderId: 'f1',
        teamId: 'team-1',
        intent: expect.any(Object),
      }),
    );
    expect(mocks.offlineCreateDocument).not.toHaveBeenCalled();
  });

  it('passes no placement through as no choice', async () => {
    await writeNewDocument(write());
    const [, made] = mocks.apiCreateDocument.mock.calls[0]! as unknown as [string, object];
    expect(made).toMatchObject({ folderId: undefined, teamId: undefined });
  });

  it('writes a This Browser document to this browser without asking who is creating', async () => {
    const w = write({ location: 'browser' });
    await writeNewDocument(w);
    expect(mocks.offlineCreateDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'd1', tabs: [tab] }),
      expect.any(Number),
    );
    expect(w.creator).not.toHaveBeenCalled();
    expect(mocks.apiCreateDocument).not.toHaveBeenCalled();
  });

  // docs/specs/029-sheets/spreadsheet.md "Making a spreadsheet": This Browser holds a spreadsheet, its first sheet
  // and workbook row in its record.
  it('writes a This Browser spreadsheet with its sheet and workbook row', async () => {
    const workbook = { format: 'ods', settings: {} } as never;
    const sheets = [{ id: 'sheetOne1', tabId: 't1', title: 'Sheet1' }];
    await writeNewDocument(
      write({
        location: 'browser',
        content: { tabs: null, tab, itemTypes: null, seedItems: [], sheets, workbook },
      }),
    );
    expect(mocks.offlineCreateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        workbook,
        sheets: [expect.objectContaining({ id: 'sheetOne1', rev: 0 })],
      }),
      expect.any(Number),
    );
  });

  it('writes a This Browser template its example cards', async () => {
    const seedItems = [{ id: 'i1' }] as never;
    await writeNewDocument(
      write({ location: 'browser', content: { tabs: [tab], tab, itemTypes: null, seedItems } }),
    );
    expect(mocks.offlineWriteItem).toHaveBeenCalledWith(
      'd1',
      { kind: 'create', creates: seedItems },
      expect.anything(),
    );
  });

  it('lets a refused create reach its caller', async () => {
    mocks.apiCreateDocument.mockRejectedValueOnce(new Error('refused'));
    await expect(writeNewDocument(write())).rejects.toThrow('refused');
  });
});

describe('trackNewDocumentCreated', () => {
  it('counts the store, theme, template and a team library', () => {
    trackNewDocumentCreated({ location: 'livedoc', templateKind: 'whiteboard', teamId: 'team-1' });
    const sent = mocks.track.mock.calls.map((c) => c.join('·'));
    expect(sent).toEqual([
      'Document·Created·Cloud',
      expect.stringMatching(/^Theme·Changed·/),
      'Template·Used·T:whiteboard',
      'Draw·Created·Template',
      'Team·Added·Document',
    ]);
  });

  it('never counts a team for This Browser', () => {
    trackNewDocumentCreated({ location: 'browser', templateKind: null, teamId: 'team-1' });
    expect(mocks.track.mock.calls.map((c) => c.join('·'))).toEqual([
      'Document·Created·Offline',
      expect.stringMatching(/^Theme·Changed·/),
    ]);
  });
});

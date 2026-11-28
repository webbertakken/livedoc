// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackMock = vi.fn<typeof import('@/lib/telemetry').track>();
const setFolderMock = vi.fn<typeof import('@/lib/api-client').apiSetDocumentFolder>();
vi.mock('@/lib/telemetry', () => ({
  track: (...a: Parameters<typeof trackMock>) => trackMock(...a),
}));
vi.mock('@/lib/api-client', () => ({
  apiCopyDocument: vi.fn(),
  apiSetDocumentFolder: (...a: Parameters<typeof setFolderMock>) => setFolderMock(...a),
}));
vi.mock('@/hooks/persistence/useDocumentListActions', () => ({
  useDocumentListActions: () => ({}),
}));
const toastError = vi.fn<(message: string) => void>();
vi.mock('@/hooks/ui/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: toastError }),
}));

const { useDocumentActions } = await import('./useDocumentActions');

// The two hooks useDocumentActions calls are mocked above; one render gives its actions.
function actions(documentId: string | null = null, setCopying = vi.fn()) {
  return renderHook(() =>
    useDocumentActions({
      documentId,
      documentName: '',
      documentList: [],
      setDocumentList: vi.fn(),
      confirm: vi.fn() as never,
      ownerId: 'me',
      hookDeleteFolder: vi.fn(async () => true),
      folders: [],
      sharedDocuments: [],
      setSharedDocuments: vi.fn(),
      copying: false,
      setCopying,
      sessionShareCode: null,
      refreshTeamLibraries: vi.fn(),
      refreshDocumentList: vi.fn(),
    }),
  ).result.current;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// docs/specs/035-pdf-documents/live-editing-and-storage.md "Copies, the Trash and versions": someone else's copy that
// would pass their allowance is refused, and said.
describe('makeCopy', () => {
  beforeEach(() => {
    toastError.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('says a copy does not fit the file storage that is left, and lets the person try again', async () => {
    const { ApiError } = await import('@/lib/api/core');
    const { apiCopyDocument } = await import('@/lib/api-client');
    vi.mocked(apiCopyDocument).mockRejectedValue(new ApiError('copy', 403, 'usage_exceeded'));
    const setCopying = vi.fn();
    await actions('d1', setCopying).makeCopy();
    expect(toastError).toHaveBeenCalledExactlyOnceWith(
      "This document doesn't fit in the file storage that is left.",
    );
    expect(setCopying.mock.calls).toEqual([[true], [false]]);
  });

  // live-editing-and-storage.md "Copies, the Trash and versions": any other refusal is said too, never silent.
  it('says any other refusal, and lets the person try again', async () => {
    const { apiCopyDocument } = await import('@/lib/api-client');
    vi.mocked(apiCopyDocument).mockRejectedValue(new Error('offline'));
    const setCopying = vi.fn();
    await actions('d1', setCopying).makeCopy();
    expect(toastError).toHaveBeenCalledExactlyOnceWith('The copy couldn’t be made. Try again.');
    expect(console.warn).toHaveBeenCalledWith('[document] copy refused name=failed');
    expect(setCopying).toHaveBeenLastCalledWith(false);
  });
});

// docs/specs/017-telemetry/telemetry.md: Team·Added·Document counts a document ENTERING a team library,
// whichever surface filed it; Team·Moved·Document is every other scope move.
describe('moveDocumentTo telemetry', () => {
  beforeEach(() => {
    trackMock.mockReset();
    setFolderMock.mockReset().mockResolvedValue(undefined);
  });

  it('counts a personal document filed into a team as Added', async () => {
    actions().moveDocumentTo('d1', { teamId: 't1', folderId: null }, null);
    await flush();
    expect(trackMock).toHaveBeenCalledExactlyOnceWith('Team', 'Added', 'Document');
  });

  it('counts a move within or out of a team as Moved', async () => {
    actions().moveDocumentTo('d1', { teamId: 't1', folderId: 'f1' }, 't1');
    actions().moveDocumentTo('d1', { teamId: null, folderId: null }, 't1');
    // A caller that does not say where the document came from (team library rows).
    actions().moveDocumentTo('d1', { teamId: 't2', folderId: null });
    await flush();
    expect(trackMock.mock.calls).toEqual([
      ['Team', 'Moved', 'Document'],
      ['Team', 'Moved', 'Document'],
      ['Team', 'Moved', 'Document'],
    ]);
  });

  it('counts nothing when the server refused the move', async () => {
    setFolderMock.mockRejectedValue(new Error('403'));
    actions().moveDocumentTo('d1', { teamId: 't1', folderId: null }, null);
    await flush();
    expect(trackMock).not.toHaveBeenCalled();
  });
});

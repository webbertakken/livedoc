// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToastActionSpec } from '@/hooks/ui/useToast';
import type { DocumentListItem } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  apiDeleteDocument: vi.fn(),
  apiDismissSharedWith: vi.fn(),
  apiSaveDocumentMeta: vi.fn(),
  apiSetDocumentFolder: vi.fn(),
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/api/trash', () => ({ apiRestoreDocument: vi.fn() }));
vi.mock('@/lib/app-location', () => ({ assignAppLocation: vi.fn() }));

const { apiDeleteDocument, apiSaveDocumentMeta, apiSetDocumentFolder } =
  await import('@/lib/api-client');
const { track } = await import('@/lib/telemetry');
const { isDocumentDeleted } = await import('@/lib/document-tombstones');
const { apiRestoreDocument } = await import('@/lib/api/trash');
const { assignAppLocation } = await import('@/lib/app-location');
const { takeDeleteUndo } = await import('@/lib/document-delete-undo');
const { useDocumentListActions } = await import('./useDocumentListActions');

// Deleting from an Explorer list (docs/specs/013-workspace/trash.md "Deleting"): nothing is asked first, the row
// leaves at once, and only a delete the api accepted is said, with an Undo that puts it back.

const row = (id: string) => ({ id, name: `Doc ${id}`, folderId: null }) as DocumentListItem;

function setup(currentDocument: { id: string; name: string } | null = null) {
  const confirm = vi.fn(async () => true);
  let list = [row('a'), row('b'), row('c')];
  const setDocumentList = vi.fn(
    (next: DocumentListItem[] | ((p: DocumentListItem[]) => DocumentListItem[])) => {
      list = typeof next === 'function' ? next(list) : next;
    },
  );
  const toast = {
    success: vi.fn(),
    error: vi.fn(),
    action: vi.fn<(spec: ToastActionSpec) => void>(),
    dismissAction: vi.fn(),
  };
  const { result } = renderHook(() =>
    useDocumentListActions({
      ownerId: 'owner-1',
      documentList: list,
      setDocumentList,
      confirm,
      toast: toast as never,
      deleteFolderFromHook: vi.fn(),
      folders: [{ id: 'f1', name: 'Plans', parentId: null }],
      afterDuplicate: vi.fn(),
      currentDocument,
    }),
  );
  return {
    actions: result.current,
    toast,
    confirm,
    ids: () => list.map((d) => d.id),
    folderOf: (id: string) => list.find((d) => d.id === id)?.folderId,
    nameOf: (id: string) => list.find((d) => d.id === id)?.name,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('deleteDocument from a list', () => {
  it('asks nothing, and says it once the api accepted it, with an Undo', async () => {
    vi.mocked(apiDeleteDocument).mockResolvedValueOnce(undefined);
    const { actions, toast, confirm, ids } = setup();
    await actions.deleteDocument('b');
    expect(confirm).not.toHaveBeenCalled();
    expect(ids()).toEqual(['a', 'c']);
    expect(toast.action).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '“Doc b” deleted',
        actions: [expect.objectContaining({ label: 'Undo', ariaLabel: 'Undo: restore “Doc b”' })],
      }),
    );
    expect(track).toHaveBeenCalledWith('Document', 'Deleted');
  });

  it('puts the row back where it was on Undo', async () => {
    vi.mocked(apiDeleteDocument).mockResolvedValueOnce(undefined);
    vi.mocked(apiRestoreDocument).mockResolvedValueOnce(null);
    const { actions, toast, ids } = setup();
    await actions.deleteDocument('b');
    const [spec] = toast.action.mock.calls[0]! as [
      { key: string; actions: { onSelect: () => void }[] },
    ];
    spec.actions[0]!.onSelect();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('“Doc b” restored'));
    expect(toast.dismissAction).toHaveBeenCalledWith(spec.key);
    expect(apiRestoreDocument).toHaveBeenCalledWith('owner-1', 'b');
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(track).toHaveBeenCalledWith('Trash', 'Restored', 'Personal');
  });

  it('puts the row back where it was and says so when the delete fails', async () => {
    vi.mocked(apiDeleteDocument).mockRejectedValueOnce(new Error('offline'));
    const { actions, toast, ids } = setup();
    await actions.deleteDocument('b');
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(toast.action).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Could not delete “Doc b”. Try again.');
    expect(track).not.toHaveBeenCalled();
    // Its editor may save it again.
    expect(isDocumentDeleted('b')).toBe(false);
  });
});

// docs/specs/013-workspace/folders.md "A move that fails says so".
// trash.md "Deleting": the open document's delete leaves for the Explorer, which offers the Undo; one refused stays.
describe('deleteDocument of the open document', () => {
  it('goes to the Explorer once the api accepted it, handing the Undo over', async () => {
    vi.mocked(apiDeleteDocument).mockResolvedValueOnce(undefined);
    const { actions, toast } = setup({ id: 'b', name: 'Doc b' });
    await actions.deleteDocument('b');
    expect(assignAppLocation).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith('Document', 'Deleted');
    expect(takeDeleteUndo()).toEqual({ id: 'b', name: 'Doc b', trash: 'Personal' });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('stays, lets it save again, says so and logs it when the delete is refused', async () => {
    vi.mocked(apiDeleteDocument).mockRejectedValueOnce(new Error('500'));
    const { actions, toast } = setup({ id: 'b', name: 'Doc b' });
    await actions.deleteDocument('b');
    expect(assignAppLocation).not.toHaveBeenCalled();
    expect(isDocumentDeleted('b')).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Could not delete “Doc b”. Try again.');
    expect(console.warn).toHaveBeenCalledWith(
      '[editor] delete-failed, document kept',
      expect.any(Error),
    );
    expect(track).not.toHaveBeenCalledWith('Document', 'Deleted');
    expect(takeDeleteUndo()).toBeNull();
  });
});

describe('moveDocumentToFolder', () => {
  // docs/specs/004-interface-design/toasts.md "Naming what it acted on": the move names the document and where it
  // went, with an Undo that moves it back.
  it('says where it went once the api accepted it, with an Undo', async () => {
    vi.mocked(apiSetDocumentFolder).mockResolvedValueOnce(undefined);
    const { actions, toast } = setup();
    actions.moveDocumentToFolder('b', 'f1');
    await vi.waitFor(() => expect(toast.action).toHaveBeenCalledOnce());
    const offer = toast.action.mock.calls[0]![0];
    expect(offer.message).toBe('“Doc b” moved to “Plans”');
    expect(offer.actions.map((a) => a.label)).toEqual(['Undo']);
    expect(offer.actions[0]!.ariaLabel).toBe('Undo: move “Doc b” back');
    expect(track).toHaveBeenCalledWith('Document', 'Moved');
  });

  it('says when it went back to My Documents', async () => {
    vi.mocked(apiSetDocumentFolder).mockResolvedValueOnce(undefined);
    const { actions, toast } = setup();
    actions.moveDocumentToFolder('b', null);
    await vi.waitFor(() =>
      expect(toast.action.mock.calls[0]?.[0].message).toBe('“Doc b” moved to My Documents'),
    );
  });

  it('moves it back to where it was on Undo, and says so without another Undo', async () => {
    vi.mocked(apiSetDocumentFolder).mockResolvedValue(undefined);
    const { actions, toast, folderOf } = setup();
    actions.moveDocumentToFolder('b', 'f1');
    await vi.waitFor(() => expect(toast.action).toHaveBeenCalledOnce());
    const offer = toast.action.mock.calls[0]![0];
    offer.actions[0]!.onSelect();
    expect(toast.dismissAction).toHaveBeenCalledWith(offer.key);
    expect(folderOf('b')).toBeNull();
    expect(vi.mocked(apiSetDocumentFolder)).toHaveBeenLastCalledWith('owner-1', 'b', null);
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('“Doc b” moved back to My Documents'),
    );
    expect(toast.action).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith('Document', 'Moved', 'Undo');
  });

  it('puts the row back, says so and logs it when the move fails', async () => {
    vi.mocked(apiSetDocumentFolder).mockRejectedValueOnce(new Error('offline'));
    const { actions, toast, folderOf } = setup();
    actions.moveDocumentToFolder('b', 'f1');
    expect(folderOf('b')).toBe('f1');
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not move “Doc b”. Try again.'),
    );
    expect(folderOf('b')).toBeNull();
    expect(track).not.toHaveBeenCalled();
    expect(vi.mocked(console.warn).mock.calls.map(([message]) => String(message))).toEqual([
      '[explorer-move] document failed document=b: offline',
    ]);
  });
});

// docs/specs/013-workspace/folders.md "Refused changes": a refusal takes back only its own change.
describe('a refused change', () => {
  const deferred = () => {
    let reject!: (e: Error) => void;
    const promise = new Promise<undefined>((_, r) => (reject = r));
    return { promise, reject };
  };

  it('keeps a newer name when an older rename is refused', async () => {
    const slow = deferred();
    vi.mocked(apiSaveDocumentMeta)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(undefined);
    const { actions, toast, nameOf } = setup();
    actions.renameDocument('b', 'Second');
    actions.renameDocument('b', 'Third');
    await vi.waitFor(() => expect(track).toHaveBeenCalledWith('Document', 'Renamed'));
    slow.reject(new Error('refused'));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(nameOf('b')).toBe('Third');
  });

  it('falls back to the stored name only when every rename is refused', async () => {
    vi.mocked(apiSaveDocumentMeta)
      .mockRejectedValueOnce(new Error('refused'))
      .mockRejectedValueOnce(new Error('refused'));
    const { actions, toast, nameOf } = setup();
    actions.renameDocument('b', 'Second');
    actions.renameDocument('b', 'Third');
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
    expect(nameOf('b')).toBe('Doc b');
  });

  it('keeps a newer folder when an older move is refused', async () => {
    const slow = deferred();
    vi.mocked(apiSetDocumentFolder)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(undefined);
    const { actions, toast, folderOf } = setup();
    actions.moveDocumentToFolder('b', 'f1');
    actions.moveDocumentToFolder('b', 'f2');
    await vi.waitFor(() => expect(track).toHaveBeenCalledWith('Document', 'Moved'));
    slow.reject(new Error('refused'));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(folderOf('b')).toBe('f2');
  });
});

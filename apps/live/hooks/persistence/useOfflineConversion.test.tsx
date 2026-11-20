// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// docs/specs/006-document/offline-mode.md "Syncing in place": Sync Document and Take Offline from an Explorer menu
// never reload the page. The document open in the editor moves in place; any other moves on its own, and the
// Explorer's lists are read again once the move settles.

const { convert, track, confirm, toast } = vi.hoisted(() => ({
  convert: { saveOfflineToCloud: vi.fn(), takeCloudOffline: vi.fn() },
  track: vi.fn(),
  confirm: vi.fn(),
  toast: { error: vi.fn() },
}));
vi.mock('@/lib/offline/offline-convert', async (orig) => ({
  ...(await orig<typeof import('@/lib/offline/offline-convert')>()),
  saveOfflineToCloud: convert.saveOfflineToCloud,
  takeCloudOffline: convert.takeCloudOffline,
}));
vi.mock('@/lib/telemetry', () => ({ track }));
vi.mock('@/hooks/ui/useConfirm', () => ({ useConfirm: () => confirm }));
vi.mock('@/hooks/ui/useToast', () => ({ useToast: () => toast }));
vi.mock('@/lib/shared-tabs-notice', () => ({ fetchSharedTabsNotice: async () => null }));

import { EditorStateProvider } from '@/app/document/[id]/EditorContext';
import { ExplorerProvider } from '@/app/explorer/ExplorerContext';
import { SyncStillSavingError } from '@/lib/offline/offline-convert';
import { useOfflineConversion } from './useOfflineConversion';

const reload = vi.fn();
const doc = { id: 'doc-1', name: 'Roadmap' };

function editor(documentId: string) {
  return {
    documentId,
    syncToCloud: vi.fn(async () => {}),
    takeOfflineInPlace: vi.fn(async () => {}),
    refreshOwnDocuments: vi.fn(),
  };
}

function inEditor(value: ReturnType<typeof editor>) {
  return ({ children }: { children: ReactNode }) => (
    <EditorStateProvider state={value as never}>{children}</EditorStateProvider>
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
  convert.saveOfflineToCloud.mockResolvedValue({ id: 'doc-1', imageIds: new Map() });
  convert.takeCloudOffline.mockResolvedValue(undefined);
  confirm.mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe('useOfflineConversion', () => {
  it('syncs the document open in the editor in place, with no reload', async () => {
    const open = editor('doc-1');
    const { result } = renderHook(() => useOfflineConversion(doc, 'guest-1', vi.fn()), {
      wrapper: inEditor(open),
    });
    await result.current.syncToCloud();
    expect(open.syncToCloud).toHaveBeenCalledOnce();
    expect(convert.saveOfflineToCloud).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('takes the document open in the editor offline in place once confirmed', async () => {
    const open = editor('doc-1');
    const { result } = renderHook(() => useOfflineConversion(doc, 'guest-1', vi.fn()), {
      wrapper: inEditor(open),
    });
    await result.current.takeOffline();
    expect(confirm).toHaveBeenCalledOnce();
    expect(open.takeOfflineInPlace).toHaveBeenCalledOnce();
    expect(convert.takeCloudOffline).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('moves another document on its own and reads the editor panel lists again', async () => {
    const open = editor('another');
    const { result } = renderHook(() => useOfflineConversion(doc, 'guest-1', vi.fn()), {
      wrapper: inEditor(open),
    });
    await result.current.syncToCloud();
    await result.current.takeOffline();
    expect(convert.saveOfflineToCloud).toHaveBeenCalledWith('doc-1', 'guest-1');
    expect(convert.takeCloudOffline).toHaveBeenCalledWith('doc-1', 'guest-1', null);
    expect(open.refreshOwnDocuments).toHaveBeenCalledTimes(2);
    expect(track.mock.calls).toEqual([
      ['Document', 'Moved', 'SavedToCloud'],
      ['Document', 'Moved', 'TakenOffline'],
    ]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reads the Explorer page lists again once a move settles', async () => {
    const refreshPersonal = vi.fn(async () => {});
    const { result } = renderHook(() => useOfflineConversion(doc, 'guest-1', vi.fn()), {
      wrapper: ({ children }) => (
        <ExplorerProvider value={{ refreshPersonal } as never}>{children}</ExplorerProvider>
      ),
    });
    await result.current.syncToCloud();
    expect(refreshPersonal).toHaveBeenCalledWith('guest-1');
    expect(reload).not.toHaveBeenCalled();
  });

  it('says why when the open document cannot move yet, and reads nothing again', async () => {
    const open = editor('doc-1');
    open.takeOfflineInPlace.mockRejectedValueOnce(new SyncStillSavingError());
    const { result } = renderHook(() => useOfflineConversion(doc, 'guest-1', vi.fn()), {
      wrapper: inEditor(open),
    });
    await result.current.takeOffline();
    expect(toast.error).toHaveBeenCalledWith('Still saving this document. Try again in a moment.');
    expect(open.refreshOwnDocuments).not.toHaveBeenCalled();
  });
});

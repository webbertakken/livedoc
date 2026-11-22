'use client';

import { useOptionalEditorContext } from '@/app/document/[id]/EditorContext';
import { useOptionalExplorer } from '@/app/explorer/ExplorerContext';
import { useConfirm } from '@/hooks/ui/useConfirm';
import { useToast } from '@/hooks/ui/useToast';
import { fetchSharedTabsNotice } from '@/lib/shared-tabs-notice';
import { track } from '@/lib/telemetry';
import {
  ConversionInProgressError,
  conversionInProgress,
  saveOfflineToCloud,
  syncFailureMessage,
  takeCloudOffline,
  takeOfflineFailureMessage,
} from '@/lib/offline/offline-convert';

// Shared Offline Mode conversion handlers (docs/specs/006-document/offline-mode.md) for the Explorer's row and
// card menus, on the Explorer page and in the editor's Explorer panel. `syncToCloud` uploads an offline document to
// the account; `takeOffline` pulls a cloud document down and deletes the server copy (gated by a confirm). Neither
// reloads the page: the document open in the editor moves in place (useSyncInPlace, useTakeOfflineInPlace), any
// other moves on its own, and the surface's lists are read again once the move settles. A second conversion of the
// same document while one runs does nothing: the guard is the conversion's own (offline-convert), not this hook's
// state, which went with the menu the moment it closed. `close` runs first to dismiss the caller's menu.
export function useOfflineConversion(
  liveDoc: { id: string; name: string; shareCode?: string | null },
  ownerId: string | null,
  close: () => void,
) {
  const confirm = useConfirm();
  const toast = useToast();
  const editor = useOptionalEditorContext();
  const explorer = useOptionalExplorer();
  // The editor that has this very document open moves it in place.
  const openHere = editor !== null && editor.documentId === liveDoc.id ? editor : null;
  // The lists this surface shows, read again once a move of another document settled.
  const readListsAgain = (owner: string) => {
    if (editor) editor.refreshOwnDocuments();
    else if (explorer) void explorer.refreshPersonal(owner);
  };
  const syncToCloud = async () => {
    if (!ownerId || conversionInProgress(liveDoc.id)) return;
    close();
    try {
      if (openHere) {
        await openHere.syncToCloud();
        return;
      }
      await saveOfflineToCloud(liveDoc.id, ownerId);
      track('Document', 'Moved', 'SavedToCloud');
      readListsAgain(ownerId);
    } catch (e) {
      // Stays offline. A conversion already running reports for itself.
      if (!(e instanceof ConversionInProgressError)) toast.error(syncFailureMessage(e));
    }
  };

  const takeOffline = async () => {
    if (!ownerId || conversionInProgress(liveDoc.id)) return;
    close();
    // A shared tab stays in its other documents and forks here (docs/specs/006-document/offline-mode.md).
    const notice = await fetchSharedTabsNotice(ownerId, liveDoc.id, 'offline');
    const ok = await confirm({
      title: `Take “${liveDoc.name}” Offline?`,
      message: [
        'This removes it from your account and every other device. It will exist only in this browser, with no backup.',
        notice,
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: 'Take Offline',
    });
    if (!ok) return;
    try {
      if (openHere) {
        await openHere.takeOfflineInPlace();
        return;
      }
      await takeCloudOffline(liveDoc.id, ownerId, liveDoc.shareCode ?? null);
      track('Document', 'Moved', 'TakenOffline');
      readListsAgain(ownerId);
    } catch (e) {
      // Stays on the server (aborts roll the local copy back). A conversion already running
      // reports for itself.
      if (e instanceof ConversionInProgressError) return;
      toast.error(takeOfflineFailureMessage(e));
    }
  };

  return { syncToCloud, takeOffline };
}

'use client';

// The office title row's document parts, built where their state lives (the editor page) and carried to a surface by
// EditorLinesContext (docs/specs/034-text-documents/editing-surface.md "The title row"): rename, star, move, Share or
// Make a copy, Settings, the account, the people here, Move to trash, and the facts File > Details says
// (files-and-print.md "Details", "Trash"). Each part is null where the session may not use it. The
// move dialog is drawn by the page, beside the editor's other dialogs.
import { useMemo, useState, type ReactNode } from 'react';
import { useBackTarget } from '@/components/chrome/lines/BrandBack';
import { useIsOfflineDocument } from '@/hooks/persistence/useIsOfflineDocument';
import { MoveDocumentDialog } from '@/components/dialogs/MoveDocumentDialog';
import type { OfficeChrome } from '@/components/office/office-chrome';
import { othersInDocument } from '@/lib/others-in-document';
import { documentFactsFrom } from '@/lib/office/office-details';
import { track } from '@/lib/telemetry';
import { applyDocumentRename } from './editor-page-helpers';
import { useEditorContext } from './EditorContext';
import { useSelectTab } from './useSelectTab';

export function useOfficeChrome(): { chrome: OfficeChrome | null; dialog: ReactNode } {
  const ctx = useEditorContext();
  const back = useBackTarget();
  const [moving, setMoving] = useState(false);
  const {
    documentId,
    documentName,
    documentTeamId,
    tabs,
    nameDocument,
    renameTab,
    isStructureReadOnly,
    renameDocumentNonce,
    favouriteIds,
    toggleFavourite,
    canShareDocument,
    hydrated,
    documentShareable,
    setShareDialogOpen,
    makeCopy,
    copying,
    setSettingsOpen,
    openSettingsOn,
    participantsByTab,
    selfParticipant,
    embedMode,
    canDeleteDocument,
    deleteDocument,
    documentList,
    folders,
    teams,
    teamFolders,
    teamDocuments,
    isOwner,
    documentOwnerName,
    documentOpenedDates,
  } = ctx;
  const selectTab = useSelectTab();
  const isOffline = useIsOfflineDocument(documentId);

  const chrome = useMemo((): OfficeChrome | null => {
    if (embedMode || !documentId) return null;
    const files = canShareDocument && hydrated;
    return {
      back,
      rename: isStructureReadOnly
        ? null
        : (next) =>
            applyDocumentRename({
              previous: documentName,
              next,
              tabs,
              nameDocument,
              renameTab,
              renamed: () => track('Document', 'Renamed'),
            }),
      renameNonce: renameDocumentNonce,
      star: {
        starred: favouriteIds.has(documentId),
        onToggle: () => toggleFavourite(documentId),
      },
      move: files ? () => setMoving(true) : null,
      trash: canDeleteDocument ? () => void deleteDocument(documentId) : null,
      facts: documentFactsFrom({
        documentId,
        offline: isOffline,
        isOwner,
        ownerName: documentOwnerName,
        teamId: documentTeamId ?? null,
        documents: documentList,
        folders,
        teamDocuments,
        teamFolders,
        teams,
        opened: documentOpenedDates,
      }),
      share: files
        ? {
            shareable: documentShareable,
            onOpen: () => {
              setShareDialogOpen(true);
              track('UI', 'Opened', 'Share');
            },
          }
        : null,
      makeCopy: !canShareDocument && hydrated ? { copying, run: () => void makeCopy() } : null,
      onOpenSettings: () => {
        setSettingsOpen(true);
        track('UI', 'Opened', 'Settings');
      },
      onOpenAccount: () => openSettingsOn('account'),
      people: othersInDocument(participantsByTab, selfParticipant.id),
      onOpenTab: selectTab,
    };
  }, [
    embedMode,
    documentId,
    canShareDocument,
    hydrated,
    back,
    isStructureReadOnly,
    documentName,
    tabs,
    nameDocument,
    renameTab,
    renameDocumentNonce,
    favouriteIds,
    toggleFavourite,
    documentShareable,
    setShareDialogOpen,
    copying,
    makeCopy,
    setSettingsOpen,
    openSettingsOn,
    participantsByTab,
    selfParticipant.id,
    selectTab,
    canDeleteDocument,
    deleteDocument,
    isOffline,
    isOwner,
    documentOwnerName,
    documentTeamId,
    documentList,
    folders,
    teamDocuments,
    teamFolders,
    teams,
    documentOpenedDates,
  ]);

  const dialog =
    moving && documentId ? (
      <MoveDocumentDialog
        target={{ id: documentId, teamId: documentTeamId ?? null }}
        ownerId={selfParticipant.id}
        documents={ctx.documentList}
        folders={ctx.folders}
        teams={ctx.teams}
        teamFolders={ctx.teamFolders}
        teamDocuments={ctx.teamDocuments}
        onCreateFolder={ctx.createFolder}
        onMoveDocumentToFolder={ctx.moveDocumentToFolder}
        // A document in This Browser files into My Documents alone: a team holds only documents stored on LiveDoc.
        onMoveDocumentTo={isOffline ? undefined : ctx.moveDocumentTo}
        onClose={() => setMoving(false)}
      />
    ) : null;

  return { chrome, dialog };
}

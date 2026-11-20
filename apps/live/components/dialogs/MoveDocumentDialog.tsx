'use client';

// Moving one document in the editor (docs/specs/013-workspace/folders.md, team-shared-documents.md): the shared
// placement browser over My Documents and each of the person's teams, opened on where the document is now. A purely
// personal pick keeps the optimistic personal move; a pick that involves a team on either side goes through the
// scope-aware move. Used by the Explorer panel and the office title row's Move, one dialog for both.
import { apiCreateFolder, type DocumentListItem, type Folder } from '@/lib/api-client';
import type { TeamDocumentRow, TeamFolderRow } from '@/hooks/persistence/useTeamLibrariesSweep';
import { useToast } from '@/hooks/ui/useToast';
import { logMoveFailure } from '@/lib/move-failure';
import { track } from '@/lib/telemetry';
import { FOLDER_FAILURE } from '@/lib/write-failure-copy';
import { MoveToFolderDialog, type MoveDestination } from './MoveToFolderDialog';

export type MoveDocumentTarget = { id: string; teamId: string | null };

export function MoveDocumentDialog({
  target,
  ownerId,
  documents,
  folders,
  teams,
  teamFolders,
  teamDocuments,
  onCreateFolder,
  onMoveDocumentToFolder,
  onMoveDocumentTo,
  onClose,
}: {
  target: MoveDocumentTarget;
  ownerId: string | null;
  documents: readonly DocumentListItem[];
  folders: readonly Folder[];
  teams: readonly { id: string; name: string }[];
  teamFolders: readonly TeamFolderRow[];
  teamDocuments: readonly TeamDocumentRow[];
  onCreateFolder?: (input: { name: string; parentId: string | null }) => Promise<Folder | void>;
  onMoveDocumentToFolder?: (documentId: string, folderId: string | null) => void;
  // Without it the picker offers My Documents alone.
  onMoveDocumentTo?: (
    documentId: string,
    dest: MoveDestination,
    fromTeamId?: string | null,
  ) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const teamRow = target.teamId ? teamDocuments.find((d) => d.id === target.id) : undefined;
  const personalRow = documents.find((d) => d.id === target.id);
  const teamDests = onMoveDocumentTo
    ? teams.map((t) => ({
        id: t.id,
        name: t.name,
        folders: teamFolders
          .filter((f) => f.teamId === t.id)
          .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId })),
      }))
    : undefined;
  return (
    <MoveToFolderDialog
      subjectName={teamRow?.name || personalRow?.name || 'Untitled'}
      subjectKind="document"
      personalFolders={folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }))}
      teams={teamDests}
      currentTeamId={target.teamId}
      currentFolderId={teamRow ? (teamRow.folderId ?? null) : (personalRow?.folderId ?? null)}
      onCreateFolder={async (name, parentId, destTeamId) => {
        // Personal creates go through the host's folder hook (its tree updates at once); team creates hit the API
        // directly, as the team page's picker does.
        if (destTeamId === null) {
          if (!onCreateFolder) return null;
          const created = await onCreateFolder({ name, parentId });
          return created
            ? { id: created.id, name: created.name, parentId: created.parentId }
            : null;
        }
        if (!ownerId) return null;
        try {
          const folder = await apiCreateFolder(ownerId, {
            id: crypto.randomUUID(),
            name,
            parentId,
            teamId: destTeamId,
          });
          track('Folder', 'Created', 'Team');
          return { id: folder.id, name: folder.name, parentId: folder.parentId };
        } catch (err) {
          // The tile keeps the name typed, for another try.
          logMoveFailure('new-folder', '', err);
          toast.error(FOLDER_FAILURE.create(name));
          return null;
        }
      }}
      onPick={(dest) => {
        if (dest.teamId === null && target.teamId === null)
          onMoveDocumentToFolder?.(target.id, dest.folderId);
        else onMoveDocumentTo?.(target.id, dest, target.teamId);
      }}
      onClose={onClose}
    />
  );
}

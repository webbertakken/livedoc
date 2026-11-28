'use client';

// File > Make a copy for a text document (docs/specs/034-text-documents/files-and-print.md "Make a copy"): the Copy
// document dialog, the folder picker it hands over to, and the copy itself, opened in a new browser tab. Drawn by the
// page beside the title row's Move dialog; the shell and the Make a copy pill open it.
import { useCallback, useState, type ReactNode } from 'react';
import type { Folder } from '@/lib/api-client';
import { MoveToFolderDialog } from '@/components/dialogs/MoveToFolderDialog';
import dynamic from 'next/dynamic';
import type { OfficeCopyChoice } from '@/components/office/OfficeCopyDialog';
import { copyOpenDocument, defaultCopyFolder } from '@/lib/office/office-copy';
import { track } from '@/lib/telemetry';
import { useToast } from '@/hooks/ui/useToast';
import { COPY_DOES_NOT_FIT, COPY_FAILED, COPY_NOT_SHARED } from '@/lib/write-failure-copy';

// Drawn only once File > Make a copy is pressed, so the document page loads without it.
const OfficeCopyDialog = dynamic(
  () => import('@/components/office/OfficeCopyDialog').then((m) => m.OfficeCopyDialog),
  { ssr: false },
);

export type OfficeCopySource = {
  documentId: string | null;
  documentName: string;
  ownerId: string;
  shareCode: string | null;
  // In This Browser: copied there, with no folder row.
  local: boolean;
  isOwner: boolean;
  teamId: string | null;
  // The source's own folder in the person's list, where it has one.
  folderId: string | null;
  // The person's own folders, the only places a copy goes.
  folders: readonly Folder[];
  // A Viewer is offered no review choice: they receive no comment or suggestion.
  viewer: boolean;
  onCreateFolder?: (input: { name: string; parentId: string | null }) => Promise<Folder | void>;
};

type Phase =
  { kind: 'closed' } | { kind: 'open'; picking: boolean; copying: boolean; failure: string | null };

// The new browser tab, opened at the press so no pop-up blocker stops it, cut from this page.
function openBlankTab(): Window | null {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  return tab;
}

export function useOfficeCopy(source: OfficeCopySource): {
  open: () => void;
  copying: boolean;
  dialog: ReactNode;
} {
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  const toast = useToast();
  // The folder the person picked; undefined until they pick, so the default follows the source.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const { documentId, documentName, ownerId, shareCode, local, isOwner, teamId, folders } = source;
  const createFolder = source.onCreateFolder;
  const folderId =
    picked !== undefined
      ? picked
      : defaultCopyFolder({ isOwner, teamId, folderId: source.folderId, folders });

  const open = useCallback(() => {
    if (!documentId) return;
    setPicked(undefined);
    setPhase({ kind: 'open', picking: false, copying: false, failure: null });
  }, [documentId]);
  const close = () => setPhase({ kind: 'closed' });

  const copy = async ({ name, review, share }: OfficeCopyChoice) => {
    if (!documentId || phase.kind !== 'open' || phase.copying) return;
    setPhase({ kind: 'open', picking: false, copying: true, failure: null });
    const tab = openBlankTab();
    const made = await copyOpenDocument({
      ownerId,
      documentId,
      shareCode,
      local,
      name,
      folderId: local ? null : folderId,
      review,
      share: !local && isOwner && share,
    });
    if (!made.ok) {
      tab?.close();
      console.warn(`[text-document] copy refused name=${made.reason}`);
      const failure = made.reason === 'usage_exceeded' ? COPY_DOES_NOT_FIT : COPY_FAILED;
      setPhase({ kind: 'open', picking: false, copying: false, failure });
      return;
    }
    track('Document', 'Duplicated', 'TextDocument');
    // Made, but left private: said, as the copy opens.
    if (made.shared === false) {
      console.warn('[text-document] copy not shared');
      toast.error(COPY_NOT_SHARED);
    }
    const url = `${window.location.origin}/document/${made.id}`;
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    close();
  };

  const folderName =
    folderId === null
      ? 'My Documents'
      : (folders.find((f) => f.id === folderId)?.name ?? 'My Documents');
  const dialog =
    phase.kind === 'open' ? (
      <>
        <OfficeCopyDialog
          open={!phase.picking}
          documentName={documentName}
          folder={
            local
              ? null
              : {
                  name: folderName,
                  onChange: () => setPhase({ ...phase, picking: true, failure: null }),
                }
          }
          offerReview={!source.viewer}
          offerShare={isOwner && !local}
          copying={phase.copying}
          failure={phase.failure}
          onCopy={(choice) => void copy(choice)}
          onClose={close}
        />
        {phase.picking ? (
          <MoveToFolderDialog
            purpose="copy"
            subjectName={documentName}
            subjectKind="document"
            personalFolders={folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }))}
            currentFolderId={folderId}
            onCreateFolder={
              createFolder
                ? async (name, parentId) => {
                    const created = await createFolder({ name, parentId });
                    return created
                      ? { id: created.id, name: created.name, parentId: created.parentId }
                      : null;
                  }
                : undefined
            }
            onPick={(dest) => setPicked(dest.folderId)}
            onClose={() => setPhase({ ...phase, picking: false })}
          />
        ) : null}
      </>
    ) : null;

  return { open, copying: phase.kind === 'open' && phase.copying, dialog };
}

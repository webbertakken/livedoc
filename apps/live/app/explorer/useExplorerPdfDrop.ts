'use client';

// A PDF dropped on the Explorer (docs/specs/035-pdf-documents/files-print-and-sync.md "Opening"): it opens as a PDF
// document in the folder in view, kept where a new document of that person is: on LiveDoc, or in This Browser for a
// guest where sign-in is offered. A file dragged over the page is always taken here, never left to the browser, which
// would replace LiveDoc with its own viewer.
import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/ui/useToast';
import { assignAppLocation } from '@/lib/app-location';
import { newDocumentCreator } from '@/lib/new-document/new-document-creator';
import { newDocumentLocationFor } from '@/lib/new-document/new-document-location';
import { isOfflineLocation } from '@/lib/save-locations';
import { track } from '@/lib/telemetry';

/** (default) Said where a section takes no new document (the Trash, Shared with me, a team's page). */
export const PDF_DROP_NOT_HERE =
  "PDFs can't be added in this view. Drop it on My Documents or a folder.";

// Whether a drag carries files from the computer, as its types say while it is still over the page.
const carriesFiles = (event: DragEvent): boolean =>
  [...(event.dataTransfer?.types ?? [])].includes('Files');

export function useExplorerPdfDrop(opts: {
  ownerId: string | null;
  // Where a new document goes here: the folder in view, none chosen, or undefined where the section takes none.
  place: { folderId?: string } | undefined;
  onDocumentsCreated: () => void;
}): void {
  const toast = useToast();
  const latest = useRef({ ...opts, toast });
  useEffect(() => {
    latest.current = { ...opts, toast };
  });

  useEffect(() => {
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const drop = (event: DragEvent) => {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      const { ownerId, place, onDocumentsCreated, toast: say } = latest.current;
      if (!ownerId || !place) return say.warning(PDF_DROP_NOT_HERE);
      // Whoever the Explorer has settled; until it has, a guest, whose file is never sent anywhere unasked.
      const where = newDocumentLocationFor(place, newDocumentCreator() ?? { signedIn: false });
      const kept = isOfflineLocation(where) ? 'Offline' : 'Cloud';
      // Hashing and sending a file load with the first drop, never with the Explorer.
      void import('@/lib/pdf-document/pdf-drop')
        .then(({ openDroppedPdfs, pdfOpenerFor }) =>
          openDroppedPdfs(files, pdfOpenerFor(ownerId, place.folderId, where)),
        )
        .then((dropped) => {
          if (dropped.refused) say.error(dropped.refused);
          const [first] = dropped.documentIds;
          if (!first) return;
          dropped.documentIds.forEach(() => {
            track('Pdf', 'Imported', 'Explorer');
            track('Document', 'Created', kept);
          });
          if (dropped.made) say.success(dropped.made);
          onDocumentsCreated();
          assignAppLocation(`/document/${first}`);
        });
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);
}

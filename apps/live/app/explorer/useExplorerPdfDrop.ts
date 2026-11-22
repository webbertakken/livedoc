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

/** (default) Said when a dropped file could not be taken at all (the code that opens it did not load). */
export const PDF_DROP_FAILED = "This PDF couldn't be opened. Try again.";
/** (default) Said when the Explorer still does not know who is here after `PDF_DROP_OWNER_WAIT_MS`. */
export const PDF_DROP_NOT_READY = "LiveDoc isn't ready yet. Drop the PDF again in a moment.";
/** (default) How long a drop waits for the Explorer to know who is here: a guest's id is asked of the server as the
 *  page opens. Safe range: 2,000 to 30,000. */
export const PDF_DROP_OWNER_WAIT_MS = 10_000;
const OWNER_POLL_MS = 50;

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
    let mounted = true;
    // Who is here, once the Explorer knows: a file dropped in the page's first moments waits for it rather than
    // being refused for a place that is only not known yet.
    const ownerOnceKnown = async (): Promise<string | null> => {
      const deadline = Date.now() + PDF_DROP_OWNER_WAIT_MS;
      while (mounted && !latest.current.ownerId && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, OWNER_POLL_MS));
      return mounted ? latest.current.ownerId : null;
    };
    const open = async (files: File[]) => {
      // A section that takes no document says so at once.
      if (!latest.current.place) return latest.current.toast.warning(PDF_DROP_NOT_HERE);
      const ownerId = await ownerOnceKnown();
      if (!mounted) return;
      const { place, onDocumentsCreated, toast: say } = latest.current;
      if (!place) return say.warning(PDF_DROP_NOT_HERE);
      if (!ownerId) return say.warning(PDF_DROP_NOT_READY);
      // Whoever the Explorer has settled; until it has, a guest, whose file is never sent anywhere unasked.
      const where = newDocumentLocationFor(place, newDocumentCreator() ?? { signedIn: false });
      const kept = isOfflineLocation(where) ? 'Offline' : 'Cloud';
      // Hashing and sending a file load with the first drop, never with the Explorer.
      const { openDroppedPdfs, pdfOpenerFor } = await import('@/lib/pdf-document/pdf-drop');
      const dropped = await openDroppedPdfs(files, pdfOpenerFor(ownerId, place.folderId, where));
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
    };
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const drop = (event: DragEvent) => {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      void open(files).catch((error: unknown) => {
        console.warn('[pdf] drop failed', String(error));
        latest.current.toast.error(PDF_DROP_FAILED);
      });
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      mounted = false;
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);
}

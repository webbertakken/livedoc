// New Document's PDF document (docs/specs/013-workspace/new-document-menu.md "The blanks"; 035 starting-and-finding.md
// "Starting one"): a Blank PDF written here, or a file chosen, stored and opened as a PDF dropped on the Explorer is.
// A PDF document is its stored file, so it opens once stored, not from memory as a blank of another kind does.
import { assignAppLocation } from '@/lib/app-location';
import { debugLog } from '@/lib/debug-log';
import { pickFile } from '@/lib/pick-file';
import { track } from '@/lib/telemetry';
import { blankPdfFile } from '@/lib/pdf-document/blank-pdf';
import { PDF_TAB_ACCEPT } from '@/lib/pdf-document/pdf-tab-from-file';
import { newDocumentCreator } from './new-document-creator';
import { newDocumentLocationFor } from './new-document-location';
import type { NewDocumentPlace } from './pending-documents';

/** (default) Said when the PDF could not be stored at all (the network, or the code that stores it). */
export const NEW_PDF_FAILED = "This PDF couldn't be made. Try again.";

export type NewPdfSource = 'blank' | 'file';

/** The /new address that makes a Blank PDF in the place: the way when nobody here is bound to make it. */
export function newPdfHref(place: NewDocumentPlace): string {
  const params = new URLSearchParams({ kind: 'pdf-document' });
  if (place.folderId) params.set('folder', place.folderId);
  if (place.teamId) params.set('team', place.teamId);
  return `/new?${params.toString()}`;
}

export async function startNewPdf(request: {
  source: NewPdfSource;
  place: NewDocumentPlace;
  /** Says what went wrong, as a toast does. */
  say: (message: string) => void;
}): Promise<void> {
  const { source, place, say } = request;
  const creator = newDocumentCreator();
  if (!creator) {
    debugLog('[new-document] pdf no-creator');
    if (source === 'blank') assignAppLocation(newPdfHref(place));
    return;
  }
  const file = source === 'blank' ? blankPdfFile() : await pickFile(PDF_TAB_ACCEPT);
  if (!file) return;
  try {
    // What reads, hashes and sends a file loads with the first PDF made, never with the Explorer.
    const { openPdfFile, PDF_ARRIVAL_COPY } = await import('@/lib/pdf-document/open-pdf-file');
    const where = newDocumentLocationFor(place, creator);
    const opened = await openPdfFile(creator.ownerId, file, place.folderId, where);
    debugLog(`[new-document] pdf source=${source} ok=${opened.ok}`);
    if (!opened.ok) return say(PDF_ARRIVAL_COPY[opened.refusal]);
    track('Document', 'Created', source === 'blank' ? 'PdfBlank' : 'PdfFile');
    if (source === 'file') track('Pdf', 'Imported', 'NewDocument');
    assignAppLocation(`/document/${opened.documentId}`);
  } catch (error) {
    console.warn('[new-document] pdf failed', String(error));
    say(NEW_PDF_FAILED);
  }
}

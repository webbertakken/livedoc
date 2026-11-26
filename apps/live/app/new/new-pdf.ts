// A PDF document from /new (docs/specs/007-editor/new-document-route.md "Choosing a mode"; 035 starting-and-finding.md
// "Starting one"): a Blank PDF written here, or a chosen file, stored where a new document goes and in the asked
// folder, then opened. A PDF document is its stored file, so it opens once stored; what fails is the error card's.
import { debugLog } from '@/lib/debug-log';
import { pickFile } from '@/lib/pick-file';
import { track } from '@/lib/telemetry';
import { blankPdfFile } from '@/lib/pdf-document/blank-pdf';
import { PDF_TAB_ACCEPT } from '@/lib/pdf-document/pdf-tab-from-file';
import type { CreateFailure } from '@/lib/new-document/create-failure';
import { NEW_PDF_FAILED, type NewPdfSource } from '@/lib/new-document/start-new-pdf';
import type { SaveLocationId } from '@/lib/save-locations';
import { placementParamsFromSearch } from '@/lib/new-document-params';

export type NewPdfDeps = {
  search: string;
  /** Who makes it, once identity settles. */
  ownerId: () => Promise<string>;
  /** Where it is stored, as any new document's place is decided. */
  location: () => Promise<
    { ok: true; value: SaveLocationId } | { ok: false; failure: CreateFailure }
  >;
  go: (href: string) => void;
  fail: (failure: CreateFailure) => void;
};

const failure = (message: string): CreateFailure => ({
  action: 'retry',
  eyebrow: 'PDF document',
  title: "This PDF couldn't be made",
  message,
  actionLabel: 'Try Again',
});

export async function makeNewPdf(source: NewPdfSource, deps: NewPdfDeps): Promise<void> {
  const file = source === 'blank' ? await blankPdfFile() : await pickFile(PDF_TAB_ACCEPT);
  if (!file) return;
  try {
    const located = await deps.location();
    if (!located.ok) return deps.fail(located.failure);
    const { folderId } = placementParamsFromSearch(deps.search);
    const { openPdfFile, PDF_ARRIVAL_COPY } = await import('@/lib/pdf-document/open-pdf-file');
    const opened = await openPdfFile(await deps.ownerId(), file, folderId, located.value);
    debugLog(`[new] pdf source=${source} ok=${opened.ok}`);
    if (!opened.ok) return deps.fail(failure(PDF_ARRIVAL_COPY[opened.refusal]));
    track('Document', 'Created', source === 'blank' ? 'PdfBlank' : 'PdfFile');
    if (source === 'file') track('Pdf', 'Imported', 'NewDocument');
    deps.go(`/document/${opened.documentId}`);
  } catch (error) {
    console.warn('[new] pdf failed', String(error));
    deps.fail(failure(NEW_PDF_FAILED));
  }
}

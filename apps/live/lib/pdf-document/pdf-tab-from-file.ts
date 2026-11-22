// The add menu's PDF from a file, as the editor starts it (docs/specs/035-pdf-documents/pdf-document.md "A PDF tab
// from a file"): the chooser, the word for a slow one, a refusal said, the stored tab landed. What reads, hashes and
// sends the file loads with the first file chosen, never with the editor.
import type { Tab } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { pickFile } from '@/lib/pick-file';
import { track } from '@/lib/telemetry';

export const PDF_TAB_ACCEPT = 'application/pdf,.pdf';

/** (default) How long adding a PDF tab may take before a toast says so. Safe range: 300 to 5,000 ms. */
export const PDF_TAB_NOTICE_MS = 1_000;

export const PDF_TAB_UPLOADING = 'Uploading the PDF…';

/** (default) Said when the file could not be taken at all (the code that takes it did not load). */
export const PDF_TAB_FAILED = "This PDF couldn't be added. Try again.";

export type PdfTabFromFile = {
  ownerId: string;
  documentId: string;
  shareCode: string | null;
  /** The id the new tab takes. */
  tabId: string;
  toast: { info: (message: string) => void; error: (message: string) => void };
  /** Puts the stored tab in the document, after the others, and selects it. */
  land: (tab: Tab) => void;
};

/** Opens the chooser and adds the chosen PDF as a tab; a chooser left adds nothing and says nothing. */
export async function addPdfTabFromChooser(deps: PdfTabFromFile): Promise<void> {
  const file = await pickFile(PDF_TAB_ACCEPT);
  if (!file) return;
  const notice = setTimeout(() => deps.toast.info(PDF_TAB_UPLOADING), PDF_TAB_NOTICE_MS);
  try {
    const { addPdfTab, PDF_ARRIVAL_COPY } = await import('./add-pdf-tab');
    const added = await addPdfTab(deps, file, deps.tabId);
    if (!added.ok) {
      deps.toast.error(PDF_ARRIVAL_COPY[added.refusal]);
      return;
    }
    deps.land(added.tab);
    track('Tab', 'Created', 'Pdf');
    track('Pdf', 'Imported', 'Tab');
    debugLog('[tabs] added', { tabId: added.tab.id, choice: 'pdf' });
  } catch (error) {
    console.warn('[pdf] add failed', String(error));
    deps.toast.error(PDF_TAB_FAILED);
  } finally {
    clearTimeout(notice);
  }
}

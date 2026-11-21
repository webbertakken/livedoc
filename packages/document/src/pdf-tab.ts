// A PDF tab (docs/specs/035-pdf-documents/pdf-document.md "What it holds"): the tab row names its stored file, the
// PDF's bytes held exactly in the blob store, by key and size. Nothing else of the PDF is on the tab.
import { isBlobKey, type BlobKey } from './blob-key';
import { FILE_TAB_MAX_BYTES } from './file-limits';
import { tabKindOf } from './tab-kind';

export type PdfTabFile = { readonly blob: BlobKey; readonly size: number };

export function isPdfTab(tab: { kind?: string } | undefined): boolean {
  return tabKindOf(tab) === 'pdf';
}

/** The stored file a PDF tab names, or null when the tab is no PDF tab or names none a blob store could hold. */
export function pdfTabOf(
  tab: { kind?: unknown; blob?: unknown; size?: unknown } | undefined,
): PdfTabFile | null {
  if (tab?.kind !== 'pdf' || !isBlobKey(tab.blob)) return null;
  const { size } = tab;
  if (typeof size !== 'number' || !Number.isInteger(size)) return null;
  if (size < 1 || size > FILE_TAB_MAX_BYTES) return null;
  return { blob: tab.blob, size };
}

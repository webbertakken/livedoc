// A PDF imported as a new text document (docs/specs/034-text-documents/files-and-print.md "A PDF imported"): read in
// this browser by the PDF engine (the one place a PDF is parsed; the room has no PDF reader), its pages read into an
// OpenDocument text document, which rides the create as a state with its import report in it, as a copy does.
import {
  base64OfBytes,
  importRecordOf,
  readPdfPages,
  TextDocumentState,
} from '@livedoc/text-documents';
import type { PdfEngine } from '@livedoc/pdf-documents';
import { apiCreateDocument } from '@/lib/api-client';
import { createIdsFor } from '@/lib/new-document/create-failure';
import { debugLog } from '@/lib/debug-log';
import { keepImportReport } from '@/lib/office/import-report-handoff';
import { PDF_REFUSAL_COPY } from '@/lib/pdf-document/pdf-refusals';
import { track } from '@/lib/telemetry';
import { pdfImportPages } from './pdf-import-pages';
import { newTextDocumentTab } from './text-document-tab';

/** An engine of its own for one import, ended once it is read. */
export type PdfImportEngine = PdfEngine & { readonly terminate: () => void };

export type ImportedPdf = { ok: true; documentId: string } | { ok: false; message: string };

export const PDF_PASSWORD_REFUSAL =
  'This PDF is protected by a password. Open it as a PDF document instead.';
export const PDF_TOO_LONG = 'This file is past the 1,020,000-character limit of a text document.';
const GENERIC = 'The file could not be opened. Try again.';

// The PDF document's refusal, its first sentence: what can still be done there does not apply here.
const refusalWords = (refusal: keyof typeof PDF_REFUSAL_COPY): string =>
  PDF_REFUSAL_COPY[refusal].split(/(?<=\.) /)[0]!;

export async function importPdfFile(
  ownerId: string,
  file: File,
  name: string,
  startEngine: () => Promise<PdfImportEngine>,
): Promise<ImportedPdf> {
  const started = performance.now();
  let engine: PdfImportEngine | null = null;
  try {
    engine = await startEngine();
    const opened = await engine.open(new Uint8Array(await file.arrayBuffer()));
    if (!opened.ok) {
      const why = opened.needsPassword ? 'password' : opened.refusal;
      debugLog('[text-document] pdf import refused', { why });
      return {
        ok: false,
        message: opened.needsPassword ? PDF_PASSWORD_REFUSAL : refusalWords(opened.refusal),
      };
    }
    const pages = await pdfImportPages(engine, opened.pages.length);
    const read = readPdfPages(pages);
    if (!read.ok) {
      debugLog('[text-document] pdf import refused', { why: read.rejection });
      return { ok: false, message: PDF_TOO_LONG };
    }
    const { documentId, tabId } = createIdsFor(null);
    const state = TextDocumentState.fromDocument(read.document, importRecordOf('pdf', read.report));
    // An import is born in OpenDocument (fork C5).
    await apiCreateDocument(ownerId, {
      id: documentId,
      name,
      tabs: [newTextDocumentTab(tabId, name, 'odf')],
      textDocuments: [{ tabId, state: base64OfBytes(state) }],
    });
    track('Tab', 'Imported', 'Pdf');
    keepImportReport(documentId, { name, lines: [] });
    debugLog('[text-document] pdf import', {
      pages: pages.length,
      tagged: pages.filter((page) => page.reading === 'tags').length,
      ms: Math.round(performance.now() - started),
    });
    return { ok: true, documentId };
  } catch (error) {
    debugLog('[text-document] pdf import failed', { error: String(error) });
    return { ok: false, message: GENERIC };
  } finally {
    engine?.terminate();
  }
}

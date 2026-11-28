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
import { ApiError, apiCreateDocument } from '@/lib/api-client';
import { createIdsFor } from '@/lib/new-document/create-failure';
import { debugLog } from '@/lib/debug-log';
import { keepImportReport } from '@/lib/office/import-report-handoff';
import { PDF_REFUSAL_COPY } from '@/lib/pdf-document/pdf-refusals';
import { track } from '@/lib/telemetry';
import { pdfImportPages, type RgbaToPng } from './pdf-import-pages';
import { newTextDocumentTab } from './text-document-tab';

/** An engine of its own for one import, ended once it is read. */
export type PdfImportEngine = PdfEngine & { readonly terminate: () => void };

export type ImportedPdf = { ok: true; documentId: string } | { ok: false; message: string };

export const PDF_PASSWORD_REFUSAL =
  'This PDF is protected by a password. Open it as a PDF document instead.';
/** The create's body is capped (files-and-print.md "Opening"): a PDF whose pictures pass it is refused. */
export const PDF_TOO_HEAVY =
  'This PDF and its pictures are too large to import. Open it as a PDF document instead.';
export const PDF_TOO_LONG = 'This file is past the 1,020,000-character limit of a text document.';
const GENERIC = 'The file could not be opened. Try again.';

/** Pixels written as a PNG by the browser's own encoder. */
async function canvasPng(width: number, height: number, pixels: Uint8Array): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

// The PDF document's refusal, its first sentence: what can still be done there does not apply here.
const refusalWords = (refusal: keyof typeof PDF_REFUSAL_COPY): string =>
  PDF_REFUSAL_COPY[refusal].split(/(?<=\.) /)[0]!;

export async function importPdfFile(
  ownerId: string,
  file: File,
  name: string,
  startEngine: () => Promise<PdfImportEngine>,
  toPng: RgbaToPng = canvasPng,
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
    const pages = await pdfImportPages(engine, opened.pages.length, toPng);
    const read = await readPdfPages(pages);
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
    if (error instanceof ApiError && error.code === 'payload_too_large') {
      debugLog('[text-document] pdf import refused', { why: 'payload_too_large' });
      return { ok: false, message: PDF_TOO_HEAVY };
    }
    debugLog('[text-document] pdf import failed', { error: String(error) });
    return { ok: false, message: GENERIC };
  } finally {
    engine?.terminate();
  }
}

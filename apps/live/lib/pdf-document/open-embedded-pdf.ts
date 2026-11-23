// An embedded PDF opened as a new PDF document (docs/specs/035-pdf-documents/reading-surface.md "Embedded files"):
// its bytes arrive as any PDF does (open-pdf-file.ts), checked to be a PDF, kept where this PDF is, and opened.
import { debugLog } from '@/lib/debug-log';
import { assignAppLocation } from '@/lib/app-location';
import type { SaveLocationId } from '@/lib/save-locations';
import { track } from '@/lib/telemetry';
import { openPdfFile, PDF_ARRIVAL_COPY } from './open-pdf-file';
import type { PdfHome } from './pdf-home';

/** (default) Said of an embedded file that turns out to be no PDF. */
export const NOT_A_PDF_COPY = 'This file isn’t a PDF.';
/** (default) The name of an embedded file that gives none. */
export const UNNAMED_EMBEDDED_FILE = 'Embedded file';

/** Makes the bytes a new PDF document of `ownerId`'s, kept where this PDF is, and opens it; else what to say. */
export async function openEmbeddedPdf(
  ownerId: string,
  home: PdfHome,
  file: { name: string; bytes: Uint8Array<ArrayBuffer> },
): Promise<string | null> {
  const where: SaveLocationId = home === 'this-browser' ? 'browser' : 'livedoc';
  const { bytes } = file;
  const opened = await openPdfFile(
    ownerId,
    {
      name: file.name || `${UNNAMED_EMBEDDED_FILE}.pdf`,
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer,
    },
    undefined,
    where,
  );
  if (!opened.ok) {
    debugLog(`[pdf] embedded-refused reason=${opened.refusal}`);
    return opened.refusal === 'not_a_pdf' ? NOT_A_PDF_COPY : PDF_ARRIVAL_COPY[opened.refusal];
  }
  track('Pdf', 'Imported', 'EmbeddedFile');
  track('Document', 'Created', where === 'browser' ? 'Offline' : 'Cloud');
  assignAppLocation(`/document/${opened.documentId}`);
  return null;
}

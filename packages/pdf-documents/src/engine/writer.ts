// The stored file as the writer reads it (docs/specs/035-pdf-documents/saving.md "Addition or rewrite"). With
// bake.ts, the only files that drive the writer. What is answered here is read only: a bake opens its own copy.
import { PDF } from '@libpdf/core';
import type { PdfLayer } from '../engine-contract';
import { PDF_MAX_LAYERS, PDF_NAME_MAX_CHARS } from '../limits';

/**
 * A copy of the stored file opened by the writer, with the password the file was opened with; null where the writer
 * cannot read it. The stored bytes are never touched.
 */
export async function openWriter(stored: Uint8Array, password: string | null): Promise<PDF | null> {
  try {
    return await PDF.load(
      stored.slice(),
      password === null ? undefined : { credentials: password },
    );
  } catch {
    return null;
  }
}

/** The file's PDF layers in the file's order, at most `most`; none where the writer could not read the file. */
export function layersOf(pdf: PDF | null, most = PDF_MAX_LAYERS): readonly PdfLayer[] {
  if (!pdf) return [];
  return pdf
    .getLayers()
    .slice(0, most)
    .map((layer) => ({
      id: `o:${layer.ref.objectNumber}`,
      name: layer.name.slice(0, PDF_NAME_MAX_CHARS),
      visible: layer.visible,
      locked: layer.locked,
    }));
}

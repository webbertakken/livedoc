// The stored file as the writer reads it (docs/specs/035-pdf-documents/saving.md "Addition or rewrite"). With
// bake.ts, the only files that drive the writer. What is answered here is read only: a bake opens its own copy.
import { PDF } from '@libpdf/core';
import type { PdfLayer } from '../engine-contract';
import { PDF_MAX_LAYERS, PDF_NAME_MAX_CHARS } from '../limits';

/**
 * A copy of the stored file opened by the writer, with the password the file was opened with; null where the writer
 * cannot read it, or cannot use its password. The stored bytes are never touched.
 */
export async function openWriter(stored: Uint8Array, password: string | null): Promise<PDF | null> {
  try {
    const pdf = await PDF.load(
      stored.slice(),
      password === null ? undefined : { credentials: password },
    );
    // The writer opens a protected file whatever password it is given, and says afterwards whether that password
    // was the file's: one it could not use reads nothing, so there is no writer for the file.
    return pdf.isAuthenticated ? pdf : null;
  } catch {
    return null;
  }
}

/**
 * The file's PDF layers in the file's order, at most `most`, and whether it holds more; none where the writer could
 * not read the file.
 */
export function layersOf(
  pdf: PDF | null,
  most = PDF_MAX_LAYERS,
): { readonly layers: readonly PdfLayer[]; readonly cut: boolean } {
  const held = pdf?.getLayers() ?? [];
  return {
    layers: held.slice(0, most).map((layer) => ({
      id: `o:${layer.ref.objectNumber}`,
      name: layer.name.slice(0, PDF_NAME_MAX_CHARS),
      visible: layer.visible,
      locked: layer.locked,
    })),
    cut: held.length > most,
  };
}

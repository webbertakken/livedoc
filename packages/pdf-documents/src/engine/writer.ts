// The stored file as the writer reads it (docs/specs/035-pdf-documents/saving.md "Addition or rewrite"). With
// bake.ts, the only files that drive the writer. What is answered here is read only: a bake opens its own copy.
import { PDF, PdfArray, PdfName } from '@libpdf/core';
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
      id: layerId(layer),
      name: layer.name.slice(0, PDF_NAME_MAX_CHARS),
      visible: layer.visible,
      locked: layer.locked,
    })),
    cut: held.length > most,
  };
}

/** A layer's id as the engine names it: its object number. */
const layerId = (layer: { ref: { objectNumber: number } }): string => `o:${layer.ref.objectNumber}`;

/**
 * A copy of the file whose layers are set as one person asks (reading-surface.md "Layers"): the ones `hidden` off and
 * every other on, written as an addition for the reader to draw from; null where the file has no layers to set or the
 * writer cannot write it. The stored file is never touched: the writer read its own copy.
 */
export async function withLayersSet(
  pdf: PDF | null,
  hidden: ReadonlySet<string>,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!pdf) return null;
  try {
    const resolve = (ref: Parameters<PDF['getObject']>[0]) => pdf.getObject(ref);
    const settings = pdf.getCatalog().getDict('OCProperties', resolve)?.getDict('D', resolve);
    const layers = pdf.getLayers();
    if (!settings || layers.length === 0) return null;
    settings.set('BaseState', PdfName.of('ON'));
    settings.set(
      'ON',
      new PdfArray(layers.filter((l) => !hidden.has(layerId(l))).map((l) => l.ref)),
    );
    settings.set(
      'OFF',
      new PdfArray(layers.filter((l) => hidden.has(layerId(l))).map((l) => l.ref)),
    );
    // A state set by how the file is used (viewing, printing) would set it again over the person's.
    settings.delete('AS');
    const bytes = await pdf.save({ incremental: true });
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

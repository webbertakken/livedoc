// File > Download > PDF (docs/specs/035-pdf-documents/files-print-and-sync.md "Downloading"; saving.md "An unchanged
// file"): the bake, every live change in the file, made in the browser that asks for it. A PDF nobody changed is its
// stored file itself: no engine touches it.
import type * as Y from 'yjs';
import { downloadFileName } from '@livedoc/office-packages';
import { PdfLiveChanges, type BakeRefusal, type PdfEngine } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { UNTITLED_PDF } from './open-pdf-file';

export type PdfDownload =
  | {
      ok: true;
      kind: 'unchanged' | 'addition' | 'rewrite';
      bytes: Uint8Array<ArrayBuffer>;
      fileName: string;
    }
  | { ok: false; refusal: BakeRefusal };

/** "This PDF couldn't be written. Your changes are safe." (saving.md "Errors"). */
export const BAKE_FAILED_COPY = "This PDF couldn't be written. Your changes are safe.";

export async function bakeForDownload(deps: {
  engine: Pick<PdfEngine, 'bake'>;
  /** The live changes; null where none were loaded (a PDF that could not be read). */
  doc: Y.Doc | null;
  documentName: string;
  /** The stored file's bytes, read again from where they are held. */
  readStored: () => Promise<Uint8Array<ArrayBuffer>>;
}): Promise<PdfDownload> {
  const started = Date.now();
  const fileName = downloadFileName(deps.documentName, 'pdf', UNTITLED_PDF);
  if (!deps.doc || PdfLiveChanges.isEmpty(deps.doc)) {
    const bytes = await deps.readStored();
    debugLog(`[pdf] baked kind=unchanged bytes=${bytes.byteLength} ms=${Date.now() - started}`);
    return { ok: true, kind: 'unchanged', bytes, fileName };
  }
  const baked = await deps.engine.bake(PdfLiveChanges.encode(deps.doc));
  if (!baked.ok) {
    debugLog(`[pdf] bake-refused reason=${baked.refusal}`);
    return baked;
  }
  debugLog(
    `[pdf] baked kind=${baked.kind} bytes=${baked.bytes.byteLength} ms=${Date.now() - started} where=browser`,
  );
  // What an addition could not place is counted, never dropped silently (saving.md "Addition or rewrite").
  if (baked.anchorsLost > 0) debugLog(`[pdf] anchors-lost count=${baked.anchorsLost}`);
  if (baked.fieldsLost > 0) debugLog(`[pdf] fields-lost count=${baked.fieldsLost}`);
  return { ok: true, kind: baked.kind, bytes: baked.bytes, fileName };
}

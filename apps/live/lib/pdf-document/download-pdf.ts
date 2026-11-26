// File > Download > PDF (docs/specs/035-pdf-documents/files-print-and-sync.md "Downloading"; saving.md "An unchanged
// file"): the bake, every live change in the file, made in the browser that asks for it. A PDF nobody changed is its
// stored file itself: no engine touches it.
import type * as Y from 'yjs';
import { downloadFileName } from '@livedoc/office-packages';
import type { BlobKey } from '@livedoc/document';
import {
  PdfLiveChanges,
  pdfDigest,
  type BakeRefusal,
  type PdfEngine,
} from '@livedoc/pdf-documents';
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

/** A mark's face did not load (marks.md "Loading"). */
export const FACES_FAILED_COPY =
  "Some of this PDF's marks need a font that didn't load. Check your connection, then try again. Your changes are safe.";

/** A custom stamp's picture could not be read (custom-stamps.md "Errors"). */
export const PICTURES_FAILED_COPY =
  "Some of this PDF's stamps need a picture that couldn't be read. Check your connection, then try again. Your changes are safe.";

/** What a person is told of a bake that was not handed out. */
export const bakeProblemOf = (refusal: BakeRefusal): string =>
  refusal === 'faces-unavailable'
    ? FACES_FAILED_COPY
    : refusal === 'pictures-unavailable'
      ? PICTURES_FAILED_COPY
      : BAKE_FAILED_COPY;

/** Reads a picture a mark names, by its key, from where the document holds it. */
export type ReadPicture = (key: BlobKey) => Promise<Uint8Array<ArrayBuffer>>;

/**
 * The pictures the live changes' marks name (a custom stamp's), each read by its key (custom-stamps.md "Placing one":
 * a bake is handed each). One that cannot be read is left out, so the bake refuses by name rather than write a stamp
 * without it.
 */
export async function bakePictures(
  doc: Y.Doc,
  read: ReadPicture | undefined,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const keys = pdfDigest(doc).blobKeys;
  if (keys.length === 0 || !read) return new Map();
  const pairs = await Promise.all(
    keys.map(async (key) => {
      try {
        return [[key, await read(key)] as const];
      } catch (error) {
        debugLog(`[pdf] picture-read-failed key=${key.slice(0, 8)}`, String(error));
        return [];
      }
    }),
  );
  return new Map(pairs.flat());
}

export async function bakeForDownload(deps: {
  engine: Pick<PdfEngine, 'bake'>;
  /** The live changes; null where none were loaded (a PDF that could not be read). */
  doc: Y.Doc | null;
  documentName: string;
  /** The stored file's bytes, read again from where they are held. */
  readStored: () => Promise<Uint8Array<ArrayBuffer>>;
  /** A picture its marks name, read from where the document holds it. */
  readPicture?: ReadPicture;
}): Promise<PdfDownload> {
  const started = Date.now();
  const fileName = downloadFileName(deps.documentName, 'pdf', UNTITLED_PDF);
  if (!deps.doc || PdfLiveChanges.isEmpty(deps.doc)) {
    const bytes = await deps.readStored();
    debugLog(`[pdf] baked kind=unchanged bytes=${bytes.byteLength} ms=${Date.now() - started}`);
    return { ok: true, kind: 'unchanged', bytes, fileName };
  }
  const pictures = await bakePictures(deps.doc, deps.readPicture);
  const baked = await deps.engine.bake(PdfLiveChanges.encode(deps.doc), pictures);
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

'use client';

// File > Download > PDF on a PDF's surface (docs/specs/035-pdf-documents/files-print-and-sync.md "Downloading"): the
// bake, or the stored file itself where nobody changed it (download-pdf.ts), saved under the document's name. A bake
// that cannot be made is said, and the person's changes stay safe.
import { useCallback } from 'react';
import type * as Y from 'yjs';
import type { PdfEngine } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import { track } from '@/lib/telemetry';
import { BAKE_FAILED_COPY, bakeForDownload, bakeProblemOf, type ReadPicture } from './download-pdf';

const NO_ENGINE: Pick<PdfEngine, 'bake'> = {
  bake: async () => ({ ok: false, refusal: 'unreadable' }),
};

export function usePdfDownload({
  engine,
  doc,
  documentName,
  readStored,
  readPicture,
  onProblem,
}: {
  // The open file's engine and live changes; null where none was read.
  engine: Pick<PdfEngine, 'bake'> | null;
  doc: Y.Doc | null;
  documentName: string;
  // The stored file's bytes; null where there is no stored file to download.
  readStored: (() => Promise<Uint8Array<ArrayBuffer>>) | null;
  // A picture a mark names (a custom stamp's), read from where the document holds it.
  readPicture?: ReadPicture;
  onProblem: (problem: string | null) => void;
}): () => Promise<void> {
  return useCallback(async () => {
    if (!readStored) return;
    onProblem(null);
    try {
      const baked = await bakeForDownload({
        engine: engine ?? NO_ENGINE,
        doc,
        documentName,
        readStored,
        ...(readPicture ? { readPicture } : {}),
      });
      if (!baked.ok) return onProblem(bakeProblemOf(baked.refusal));
      downloadBlob(new Blob([baked.bytes], { type: 'application/pdf' }), baked.fileName);
      track('Pdf', 'Exported', 'Pdf');
    } catch (error) {
      debugLog('[pdf] download failed', String(error));
      onProblem(BAKE_FAILED_COPY);
    }
  }, [engine, doc, documentName, readStored, readPicture, onProblem]);
}

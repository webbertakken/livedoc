'use client';

// Opening a PDF document on its surface (docs/specs/035-pdf-documents/opening.md "While it opens";
// live-editing-and-storage.md "The layout"): read the live changes, which name the stored file; fetch that file; open
// it in the engine's worker; only then load the live changes and bind them. Each state is logged, and a refusal is
// named.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BlobKey } from '@livedoc/document';
import type { PageInfo } from '@livedoc/pdf-documents';
import { apiReadBlob } from '@/lib/api/files';
import { apiLoadPdfState, type PdfDocumentScope, type PdfStateRead } from '@/lib/api/pdf-documents';
import { ApiError } from '@/lib/api-client';
import { debugLog } from '@/lib/debug-log';
import { startPdfEngineWorker, type PdfEngineClient } from './pdf-engine-client';
import type { BindPdfLiveChanges, PdfLiveBinding } from './pdf-live-binding';
import { pdfPageDrawer, type PdfPageDrawer } from './pdf-page-drawer';
import type { PdfSurfaceRefusal } from './pdf-refusals';

export type PdfDocumentOpen =
  | { phase: 'opening' }
  | {
      phase: 'ready';
      pages: readonly PageInfo[];
      storedFile: BlobKey;
      bytes: number;
      engine: PdfEngineClient;
      drawer: PdfPageDrawer;
      binding: PdfLiveBinding;
    }
  // `storedFile`: the bytes are held and can be downloaded as they came.
  | { phase: 'refused'; refusal: PdfSurfaceRefusal; storedFile: BlobKey | null }
  // The tab is no longer a PDF tab of this document.
  | { phase: 'gone' }
  // The surface could not reach what it needs: "This tab couldn't load."
  | { phase: 'failed' };

export type PdfDocumentDeps = {
  loadState: (scope: PdfDocumentScope) => Promise<PdfStateRead>;
  readBlob: (scope: PdfDocumentScope, key: BlobKey) => Promise<Uint8Array<ArrayBuffer>>;
  startEngine: (onStopped: (reason: string) => void) => PdfEngineClient;
};

const BROWSER: PdfDocumentDeps = {
  loadState: apiLoadPdfState,
  readBlob: apiReadBlob,
  startEngine: startPdfEngineWorker,
};

const OPENING: PdfDocumentOpen = { phase: 'opening' };

const codeOf = (error: unknown): string | null => (error instanceof ApiError ? error.code : null);

export function usePdfDocument(
  scope: PdfDocumentScope,
  bind: BindPdfLiveChanges,
  // Bumped to read once more ("Try again").
  attempt: number,
  deps: PdfDocumentDeps = BROWSER,
): PdfDocumentOpen {
  const { ownerId, documentId, tabId, shareCode } = scope;
  // What the open of this tab, at this attempt, has come to; until it says, the PDF is opening.
  const opening = `${documentId}:${tabId}:${attempt}`;
  const [shown, setShown] = useState<{ of: string; open: PdfDocumentOpen } | null>(null);
  // Read as each open begins: a surface is keyed by its tab, so neither changes under an open that is under way.
  const latest = useRef({ bind, deps });
  useLayoutEffect(() => {
    latest.current = { bind, deps };
  });

  useEffect(() => {
    const where: PdfDocumentScope = { ownerId, documentId, tabId, shareCode };
    let cancelled = false;
    let engine: PdfEngineClient | null = null;
    let binding: PdfLiveBinding | null = null;
    const show = (next: PdfDocumentOpen) => {
      if (cancelled) return;
      const name = next.phase === 'refused' ? `refused name=${next.refusal}` : next.phase;
      debugLog(`[pdf] surface ${name} tab=${tabId}`);
      setShown({ of: opening, open: next });
    };
    const run = async () => {
      const { bind: bindLive, deps: from } = latest.current;
      const started = Date.now();
      let read: PdfStateRead;
      try {
        read = await from.loadState(where);
      } catch (error) {
        return show(codeOf(error) === 'pdf_not_found' ? { phase: 'gone' } : { phase: 'failed' });
      }
      const storedFile = read.storedFile;
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = await from.readBlob(where, storedFile);
      } catch (error) {
        const code = codeOf(error);
        if (code === 'blob_missing' || code === 'files_unavailable')
          return show({ phase: 'refused', refusal: code, storedFile: null });
        return show({ phase: 'failed' });
      }
      if (cancelled) return;
      const size = bytes.byteLength;
      const fetched = Date.now();
      const client = from.startEngine(() =>
        show({ phase: 'refused', refusal: 'pdf_stopped', storedFile }),
      );
      engine = client;
      const opened = await client.open(bytes);
      if (cancelled) return;
      if (!opened.ok) {
        const refusal = opened.needsPassword ? 'pdf_password' : opened.refusal;
        return show({ phase: 'refused', refusal, storedFile });
      }
      debugLog(
        `[pdf] opened pages=${opened.pages.length} bytes=${size} ranged=false ms=${Date.now() - started} read=${fetched - started} engine=${Date.now() - fetched}`,
      );
      // No live change is loaded until the engine has opened the file (opening.md "Passwords").
      try {
        binding = await bindLive(read);
      } catch {
        return show({ phase: 'failed' });
      }
      if (cancelled) return binding.close();
      show({
        phase: 'ready',
        pages: opened.pages,
        storedFile,
        bytes: size,
        engine: client,
        drawer: pdfPageDrawer(client),
        binding,
      });
    };
    void run();
    return () => {
      cancelled = true;
      binding?.close();
      engine?.terminate();
    };
  }, [ownerId, documentId, tabId, shareCode, opening]);

  return shown?.of === opening ? shown.open : OPENING;
}

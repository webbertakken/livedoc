'use client';

// Opening a PDF document on its surface (docs/specs/035-pdf-documents/opening.md "While it opens";
// live-editing-and-storage.md "The layout"): read the live changes, which name the stored file; fetch that file; open
// it in the engine's worker; only then load the live changes and bind them. Each state is logged, and a refusal is
// named. A change the room refuses is dropped (live-editing-and-storage.md "Limits"): the binding is discarded and
// the live changes are read and bound again, the pages staying as drawn. A stored file replaced is opened in place,
// and what the room had not confirmed is made again on it ("A change carried across a replacement").
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BlobKey } from '@livedoc/document';
import type { PageInfo, UnconfirmedChange } from '@livedoc/pdf-documents';
import { apiReadBlob } from '@/lib/api/files';
import { apiLoadPdfState, type PdfDocumentScope, type PdfStateRead } from '@/lib/api/pdf-documents';
import { ApiError } from '@/lib/api-client';
import { debugLog } from '@/lib/debug-log';
import { carryPdfChanges } from './pdf-carry';
import {
  startPdfEngineWorker,
  type PdfEngineClient,
  type PdfEngineStop,
} from './pdf-engine-client';
import type { PdfDocumentRefusal } from './pdf-document-bus';
import type { BindPdfLiveChanges, PdfLiveBinding } from './pdf-live-binding';
import { pdfPageDrawer, type PdfPageDrawer } from './pdf-page-drawer';
import type { PdfSurfaceRefusal } from './pdf-refusals';
import { pdfUndo, type PdfUndo } from './pdf-undo';

export type PdfDocumentOpen =
  | { phase: 'opening' }
  | {
      phase: 'ready';
      pages: readonly PageInfo[];
      storedFile: BlobKey;
      bytes: number;
      /** Whether the file is protected: opened with a password, or its permissions limited (opening.md "Passwords"). */
      protected: boolean;
      engine: PdfEngineClient;
      drawer: PdfPageDrawer;
      binding: PdfLiveBinding;
      /**
       * This person's undo on these live changes ("Undo"). Each binding has its own, so a replaced stored file or a
       * dropped change ends the steps before it.
       */
      undo: PdfUndo;
      /**
       * Listen for changes made here that could not be placed on a replaced stored file, by their count; the same
       * across bindings, and what nobody has heard yet is told to the first to listen.
       */
      onLost: (listener: (count: number) => void) => () => void;
      /** Listen for a change made here being dropped because the room refused it; the same across bindings. */
      onDropped: (listener: (refusal: PdfDocumentRefusal) => void) => () => void;
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
  startEngine: (onStopped: (reason: PdfEngineStop) => void) => PdfEngineClient;
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
    const { bind: bindLive, deps: from } = latest.current;
    let cancelled = false;
    // The engine whose pages are shown, or that is opening the file; and the live changes bound to them.
    let engine: PdfEngineClient | null = null;
    let binding: PdfLiveBinding | null = null;
    let undo: PdfUndo | null = null;
    const dropped = new Set<(refusal: PdfDocumentRefusal) => void>();
    const onDropped = (listener: (refusal: PdfDocumentRefusal) => void) => {
      dropped.add(listener);
      return () => dropped.delete(listener);
    };
    const lostListeners = new Set<(count: number) => void>();
    let untold = 0;
    const onLost = (listener: (count: number) => void) => {
      lostListeners.add(listener);
      const count = untold;
      untold = 0;
      if (count > 0) listener(count);
      return () => lostListeners.delete(listener);
    };
    const tellLost = (count: number) => {
      if (lostListeners.size === 0) untold += count;
      else if (count > 0) for (const listener of [...lostListeners]) listener(count);
    };
    const show = (next: PdfDocumentOpen) => {
      if (cancelled) return;
      const name = next.phase === 'refused' ? `refused name=${next.refusal}` : next.phase;
      debugLog(`[pdf] surface ${name} tab=${tabId}`);
      setShown({ of: opening, open: next });
    };
    const readState = async (): Promise<PdfStateRead | null> => {
      try {
        return await from.loadState(where);
      } catch (error) {
        show(codeOf(error) === 'pdf_not_found' ? { phase: 'gone' } : { phase: 'failed' });
        return null;
      }
    };

    // Opens the stored file the state names and binds the state to it. `shown`: the engine of the pages still on
    // screen, which stay until the new file's are ready ("Replacing the stored file"), then end with it.
    // `carrying`: what the room had not confirmed on the file these pages replace.
    const open = async (
      read: PdfStateRead,
      shown: PdfEngineClient | null,
      started: number,
      carrying: readonly UnconfirmedChange[] = [],
    ) => {
      // What is on screen ends when this open does, however it ends.
      const ending = <T>(result: T): T => {
        shown?.terminate();
        return result;
      };
      const storedFile = read.storedFile;
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = await from.readBlob(where, storedFile);
      } catch (error) {
        const code = codeOf(error);
        if (code === 'blob_missing' || code === 'files_unavailable')
          return ending(show({ phase: 'refused', refusal: code, storedFile: null }));
        return ending(show({ phase: 'failed' }));
      }
      if (cancelled) return ending(undefined);
      const size = bytes.byteLength;
      const fetched = Date.now();
      const client = from.startEngine(() => {
        // Only the engine whose pages are shown says so: one ended for its successor stopped on purpose.
        if (engine === client) show({ phase: 'refused', refusal: 'pdf_stopped', storedFile });
      });
      const opened = await client.open(bytes);
      if (cancelled) return ending(client.terminate());
      engine = client;
      if (!opened.ok) {
        const refusal = opened.needsPassword ? 'pdf_password' : opened.refusal;
        return ending(show({ phase: 'refused', refusal, storedFile }));
      }
      debugLog(
        `[pdf] opened pages=${opened.pages.length} bytes=${size} ranged=false ms=${Date.now() - started} read=${fetched - started} engine=${Date.now() - fetched}`,
      );
      const drawer = pdfPageDrawer(client);
      // The live changes bound to the pages that are open. A refusal of one of this binding's changes binds anew;
      // the stored file replaced opens the new one in place.
      const showBound = (bound: PdfLiveBinding) => {
        binding = bound;
        const steps = pdfUndo(bound.doc);
        undo = steps;
        const offRefused = bound.onRefused((refusal) => {
          stopHearing();
          void refresh(bound, refusal);
        });
        const offMoved = bound.onMoved(() => {
          stopHearing();
          void refresh(bound, null);
        });
        const stopHearing = () => {
          offRefused();
          offMoved();
        };
        show({
          phase: 'ready',
          pages: opened.pages,
          storedFile,
          bytes: size,
          protected: opened.document.encrypted,
          engine: client,
          drawer,
          binding: bound,
          undo: steps,
          onLost,
          onDropped,
        });
      };
      // What was not confirmed, here or in a local copy left behind on another stored file, made again on these.
      const carry = (bound: PdfLiveBinding, unconfirmed: readonly UnconfirmedChange[]) =>
        carryPdfChanges(bound.doc, [...unconfirmed, ...bound.left], {
          pages: opened.pages,
          fileMarks: (index) => client.fileMarks(index),
        });
      // The binding's changes no longer stand: one was refused (`refusal`), or the stored file was replaced. The
      // state is read again as the room holds it; what this browser had not confirmed goes with a refusal, and is
      // carried across a replacement.
      const refresh = async (old: PdfLiveBinding, refusal: PdfDocumentRefusal | null) => {
        if (refusal) debugLog(`[pdf] change-dropped tab=${tabId} name=${refusal}`);
        const unconfirmed = refusal ? [] : old.unconfirmed();
        const told = () => {
          if (refusal) for (const listener of [...dropped]) listener(refusal);
        };
        binding = null;
        undo?.destroy();
        undo = null;
        await old.discard();
        if (cancelled) return;
        const again = await readState();
        if (!again || cancelled) return;
        if (again.storedFile !== storedFile) {
          told();
          return open(again, client, Date.now(), unconfirmed);
        }
        let next: PdfLiveBinding;
        try {
          next = await bindLive(again);
        } catch {
          return show({ phase: 'failed' });
        }
        const lost = await carry(next, unconfirmed);
        if (cancelled) return next.close();
        showBound(next);
        told();
        tellLost(lost);
      };
      // No live change is loaded until the engine has opened the file (opening.md "Passwords").
      let bound: PdfLiveBinding;
      try {
        bound = await bindLive(read);
      } catch {
        return ending(show({ phase: 'failed' }));
      }
      const lost = await carry(bound, carrying);
      if (cancelled) return ending(bound.close());
      shown?.terminate();
      showBound(bound);
      tellLost(lost);
    };

    const run = async () => {
      const started = Date.now();
      const read = await readState();
      if (read) await open(read, null, started);
    };
    void run();
    return () => {
      cancelled = true;
      binding?.close();
      undo?.destroy();
      engine?.terminate();
      dropped.clear();
      lostListeners.clear();
    };
  }, [ownerId, documentId, tabId, shareCode, opening]);

  return shown?.of === opening ? shown.open : OPENING;
}

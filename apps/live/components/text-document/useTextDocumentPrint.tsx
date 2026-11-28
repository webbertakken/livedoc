'use client';

// Print and Print preview (docs/specs/034-text-documents/files-and-print.md "Printing"): what the browser prints is the
// PDF Download as PDF writes (useTextDocumentPdf's `make`), handed to it in a frame out of sight (print-frame.ts), so a
// print and the PDF always agree (director, 2026-11-28); where the browser cannot print a PDF, its pages drawn as
// pictures. A dialog says each step while the PDF is made and Cancel stops it; a print the browser refuses says so,
// and offers the PDF instead. Print preview shows the pages in their printing look, read only, with its own bar in
// place of the menus and the toolbar: Print and Close.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  printInFrame,
  type PdfPrintContent,
  type PrintOutcome,
} from '@/lib/pdf-document/print-frame';
import { startPdfEngineWorker } from '@/lib/pdf-document/pdf-engine-client';
import { pdfPagesAsPictures } from '@/lib/text-document/print/print-pictures';
import { track } from '@/lib/telemetry';
import { PDF_STEP_COPY, type PdfMade, type PdfStep, type PrintingLook } from './useTextDocumentPdf';

export const PRINT_ITEM = 'print';
export const PRINT_PREVIEW_ITEM = 'print-preview';
export const PRINT_MAKING_TITLE = 'Making the print';
export const PRINT_PREVIEW_TITLE = 'Print preview';
export const PRINT_BLOCKED_COPY =
  'Your browser blocked printing. Download the PDF and print it from there.';
export const PRINT_FAILED_COPY = 'The print couldn’t be made. Try again.';

/** The browser prints a PDF handed to it in a frame (the PDF document's test, usePdfPrint.ts). */
const printsPdf = (): boolean => navigator.pdfViewerEnabled !== false;

type Shown =
  | { readonly kind: 'step'; readonly step: PdfStep }
  | { readonly kind: 'failed' }
  | { readonly kind: 'blocked'; readonly bytes: Uint8Array<ArrayBuffer> };

/** What printing needs of the browser, injectable for tests. */
export type PrintHand = {
  readonly frame: (content: PdfPrintContent) => Promise<PrintOutcome>;
  readonly printsPdf: () => boolean;
  readonly pictures: (bytes: Uint8Array<ArrayBuffer>) => Promise<PdfPrintContent | null>;
};

const browserHand: PrintHand = {
  frame: (content) => printInFrame(content),
  printsPdf,
  pictures: async (bytes) => {
    const pictures = await pdfPagesAsPictures(bytes, startPdfEngineWorker());
    return pictures ? { way: 'pictures', pictures } : null;
  },
};

export function useTextDocumentPrint({
  make,
  printing,
  setPrinting,
  name,
  onDone,
  hand = browserHand,
}: {
  readonly make: (onStep: (step: PdfStep) => void, cancelled: () => boolean) => Promise<PdfMade>;
  readonly printing: PrintingLook;
  readonly setPrinting: (look: PrintingLook) => void;
  readonly name: string;
  /** Focus back to the writing once a print is handed over or let go. */
  readonly onDone?: () => void;
  readonly hand?: PrintHand;
}): { readonly actions: OfficeActions; readonly dialog: ReactNode; readonly bar: ReactNode } {
  const [shown, setShown] = useState<Shown | null>(null);
  const cancel = useRef(false);
  const busy = useRef(false);

  const print = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    cancel.current = false;
    setShown({ kind: 'step', step: 'laying-out' });
    try {
      const made = await make(
        (step) => setShown({ kind: 'step', step }),
        () => cancel.current,
      );
      if (cancel.current || (!made.ok && made.cancelled)) {
        debugLog('[text-document] print cancelled');
        setShown(null);
        return;
      }
      if (!made.ok) {
        setShown({ kind: 'failed' });
        return;
      }
      const content: PdfPrintContent | null = hand.printsPdf()
        ? { way: 'pdf', bytes: made.bytes }
        : await hand.pictures(made.bytes);
      if (!content) {
        debugLog('[text-document] print failed', { step: 'pictures' });
        setShown({ kind: 'failed' });
        return;
      }
      // The browser's own dialog comes next: LiveDoc's steps go first, and another print may be made meanwhile.
      setShown(null);
      busy.current = false;
      const outcome = await hand.frame(content);
      debugLog('[text-document] printed', { way: content.way, outcome });
      if (outcome === 'blocked') {
        setShown({ kind: 'blocked', bytes: made.bytes });
        return;
      }
      track('UI', 'Used', 'TextDocumentPrint');
      onDone?.();
    } finally {
      busy.current = false;
    }
  }, [make, hand, onDone]);

  const openPreview = useCallback(() => {
    debugLog('[text-document] print preview', { open: true });
    track('UI', 'Used', 'TextDocumentPrintPreview');
    setPrinting('preview');
  }, [setPrinting]);
  const closePreview = useCallback(() => {
    debugLog('[text-document] print preview', { open: false });
    setPrinting(null);
  }, [setPrinting]);

  const actions = useMemo(
    (): OfficeActions => ({
      [PRINT_ITEM]: { run: () => void print() },
      [PRINT_PREVIEW_ITEM]: { run: openPreview },
    }),
    [print, openPreview],
  );

  const close = useCallback(() => {
    cancel.current = true;
    setShown(null);
    onDone?.();
  }, [onDone]);
  const download = (bytes: Uint8Array<ArrayBuffer>) => {
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${name}.pdf`);
    track('Document', 'Exported', 'TextDocumentPdf');
    setShown(null);
  };
  const dialog = (
    <OfficeDialog
      open={shown !== null}
      onClose={close}
      title={shown?.kind === 'blocked' ? 'Print' : PRINT_MAKING_TITLE}
      {...(shown?.kind === 'blocked'
        ? { primary: { label: 'Download PDF', onPress: () => download(shown.bytes) } }
        : {})}
    >
      <p role="status" aria-live="polite" className="text-body">
        {shown === null
          ? ''
          : shown.kind === 'blocked'
            ? PRINT_BLOCKED_COPY
            : shown.kind === 'failed'
              ? PRINT_FAILED_COPY
              : PDF_STEP_COPY[shown.step]}
      </p>
    </OfficeDialog>
  );
  const bar =
    printing === 'preview' ? (
      <TextDocumentPrintPreviewBar onPrint={() => void print()} onClose={closePreview} />
    ) : null;
  return { actions, dialog, bar };
}

/** Print preview's bar, in place of the menus and the toolbar: its name, Print and Close; Escape closes, ⌘P prints. */
export function TextDocumentPrintPreviewBar({
  onPrint,
  onClose,
}: {
  readonly onPrint: () => void;
  readonly onClose: () => void;
}) {
  const printButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    printButton.current?.focus({ preventScroll: true });
    // Escape closes; ⌘P prints the pages, never the browser's print of LiveDoc's page.
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        onPrint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrint]);
  return (
    <div
      role="toolbar"
      aria-label={PRINT_PREVIEW_TITLE}
      data-print-preview-bar=""
      className="flex min-h-14 items-center gap-3 border-b border-(--office-line) bg-(--office-chrome) px-4"
    >
      <h2 className="min-w-0 flex-1 truncate text-name text-(--office-ink)">
        {PRINT_PREVIEW_TITLE}
      </h2>
      <button
        ref={printButton}
        type="button"
        onClick={onPrint}
        className="touch-target relative inline-flex h-prominent items-center rounded-full bg-(--office-primary) px-6 text-body font-medium text-(--office-primary-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-offset-2"
      >
        Print
      </button>
      <button
        type="button"
        onClick={onClose}
        className="touch-target relative inline-flex h-prominent items-center rounded-full border border-(--office-line) px-6 text-body text-(--office-primary) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-offset-2"
      >
        Close
      </button>
    </div>
  );
}

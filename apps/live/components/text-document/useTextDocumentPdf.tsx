'use client';

// File > Download > PDF document (docs/specs/034-text-documents/files-and-print.md "Downloading", PDF): the pages as
// laid out, written by the repository's one PDF writer. The surface takes its printing look (pending suggestions drawn
// accepted, nothing of the editor's own drawn, laid out on pages whatever the view), the pages are read as drawn
// (capture-pages.ts), their pictures drawn (capture-pictures.ts), their structure read from the writing
// (print-tags.ts), the look let go, and the writer loaded and run. A dialog says each step and Cancel stops it between
// steps; a failure says so in it. Print (14e) makes its PDF the same way, through `make`.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EditorView } from 'prosemirror-view';
import type { Style } from '@livedoc/text-documents';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import { browserMeasure, capturePages } from '@/lib/text-document/print/capture-pages';
import { drawPictures } from '@/lib/text-document/print/capture-pictures';
import { printFaceSource } from '@/lib/text-document/print/print-faces';
import { printStructure } from '@/lib/text-document/print/print-tags';
import { track } from '@/lib/telemetry';

export const DOWNLOAD_PDF_ITEM = 'download-pdf';

/** The surface's printing look while a PDF is made from it, or while Print preview shows it. */
export type PrintingLook = 'capture' | 'preview' | null;

/** A step of making the PDF, as the dialog says it. */
export type PdfStep = 'laying-out' | 'reading' | 'pictures' | 'writing';

export const PDF_STEP_COPY: Record<PdfStep, string> = {
  'laying-out': 'Laying out the pages…',
  reading: 'Reading the pages…',
  pictures: 'Drawing the pictures…',
  writing: 'Writing the PDF…',
};
export const PDF_MAKING_TITLE = 'Making the PDF';
export const PDF_FAILED_COPY = 'The PDF couldn’t be made. Try again.';

/** How many frames the layout may take to settle on its pages before the capture reads them anyway (default). */
export const PDF_LAYOUT_FRAMES = 120;
/** How many frames in a row the pages must stay the same to count as settled (default). */
const SETTLED_FRAMES = 3;

const nextFrame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));

/** Waits until `root` is laid out on its pages and they hold still, or `PDF_LAYOUT_FRAMES` have passed. */
async function settled(root: HTMLElement, count: () => number): Promise<void> {
  let still = 0;
  let last = -1;
  for (let frame = 0; frame < PDF_LAYOUT_FRAMES && still < SETTLED_FRAMES; frame += 1) {
    await nextFrame();
    const sheets = root.querySelectorAll('[data-page-sheet]').length;
    const ready = root.dataset.laidOut === 'pages' && sheets > 0 && sheets === count();
    still = ready && sheets === last ? still + 1 : 0;
    last = sheets;
  }
}

/** A PDF made, or why not: cancelled, or failed at a step. */
export type PdfMade =
  | { readonly ok: true; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly cancelled: boolean };

export function useTextDocumentPdf({
  view,
  root,
  pages,
  readStyles,
  name,
  printing,
  setPrinting,
  onDone,
}: {
  readonly view: EditorView | null;
  /** The page element the sheets and the writing are drawn in. */
  readonly root: () => HTMLElement | null;
  readonly pages: readonly PageGeometry[];
  readonly readStyles: () => readonly Style[];
  readonly name: string;
  /** The look the surface is in: a PDF made from Print preview leaves it there. */
  readonly printing: PrintingLook;
  readonly setPrinting: (look: PrintingLook) => void;
  /** Focus back to the writing once the PDF is downloaded or let go. */
  readonly onDone?: () => void;
}): {
  readonly actions: OfficeActions;
  readonly dialog: ReactNode;
  readonly make: (onStep: (step: PdfStep) => void, cancelled: () => boolean) => Promise<PdfMade>;
} {
  const laidOut = useRef(pages);
  const look = useRef(printing);
  useEffect(() => {
    laidOut.current = pages;
    look.current = printing;
  }, [pages, printing]);
  const [shown, setShown] = useState<{ step: PdfStep | 'failed' } | null>(null);
  const cancel = useRef(false);
  const canvas = useRef<CanvasRenderingContext2D | null>(null);

  const make = useCallback(
    async (onStep: (step: PdfStep) => void, cancelled: () => boolean): Promise<PdfMade> => {
      const started = performance.now();
      const page = root();
      if (!view || view.isDestroyed || !page) return { ok: false, cancelled: false };
      let step: PdfStep = 'laying-out';
      // Made from Print preview, the pages are already in their printing look, and stay in it.
      const before = look.current;
      try {
        onStep(step);
        if (before === null) setPrinting('capture');
        await settled(page, () => laidOut.current.length);
        if (cancelled()) return { ok: false, cancelled: true };
        step = 'reading';
        onStep(step);
        canvas.current ??= document.createElement('canvas').getContext('2d');
        const captured = capturePages(
          page,
          laidOut.current,
          browserMeasure(() => canvas.current),
        );
        step = 'pictures';
        onStep(step);
        const leftOut = await drawPictures(captured.pages, captured.pictures);
        const structure = printStructure(captured.pages, view.state.doc, readStyles(), (node) => {
          if (!view.dom.contains(node)) return null;
          try {
            return view.posAtDOM(node, 0);
          } catch {
            return null;
          }
        });
        setPrinting(before);
        if (cancelled()) return { ok: false, cancelled: true };
        step = 'writing';
        onStep(step);
        const { writeLaidOutPages, fetchMarkFace } =
          await import('@livedoc/pdf-documents/laid-out');
        const written = await writeLaidOutPages(
          {
            title: name,
            created: new Date(),
            faces: captured.faces,
            pages: captured.pages.map(({ width, height, items }) => ({ width, height, items })),
            outline: structure.outline,
            tags: structure.tags,
          },
          printFaceSource((url) => fetch(url), fetchMarkFace),
        );
        if (!written.ok) {
          debugLog('[text-document] pdf failed', { step, refusal: written.refusal });
          return { ok: false, cancelled: false };
        }
        debugLog('[text-document] pdf written', {
          pages: captured.pages.length,
          items: captured.pages.reduce((sum, each) => sum + each.items.length, 0),
          ms: Math.round(performance.now() - started),
          missing: written.missing,
          facesFailed: written.facesFailed,
          picturesLeftOut: leftOut,
          bytes: written.bytes.byteLength,
        });
        return { ok: true, bytes: written.bytes };
      } catch (error) {
        debugLog('[text-document] pdf failed', { step, error: String(error) });
        return { ok: false, cancelled: false };
      } finally {
        setPrinting(before);
      }
    },
    [view, root, readStyles, name, setPrinting],
  );

  const download = useCallback(async () => {
    cancel.current = false;
    setShown({ step: 'laying-out' });
    const made = await make(
      (step) => setShown({ step }),
      () => cancel.current,
    );
    if (made.ok && cancel.current) {
      debugLog('[text-document] pdf cancelled');
      return;
    }
    if (made.ok) {
      downloadBlob(new Blob([made.bytes], { type: 'application/pdf' }), `${name}.pdf`);
      track('Document', 'Exported', 'TextDocumentPdf');
      setShown(null);
      onDone?.();
      return;
    }
    if (made.cancelled) {
      debugLog('[text-document] pdf cancelled');
      setShown(null);
      return;
    }
    setShown({ step: 'failed' });
  }, [make, name, onDone]);

  const actions = useMemo(
    (): OfficeActions => ({ [DOWNLOAD_PDF_ITEM]: { run: () => void download() } }),
    [download],
  );
  const close = useCallback(() => {
    cancel.current = true;
    setShown(null);
    onDone?.();
  }, [onDone]);
  const dialog = (
    <OfficeDialog open={shown !== null} onClose={close} title={PDF_MAKING_TITLE}>
      <p role="status" aria-live="polite" className="text-body">
        {shown === null
          ? ''
          : shown.step === 'failed'
            ? PDF_FAILED_COPY
            : PDF_STEP_COPY[shown.step]}
      </p>
    </OfficeDialog>
  );
  return { actions, dialog, make };
}

'use client';

// File > Download > PDF document (docs/specs/034-text-documents/files-and-print.md "Downloading", PDF): the pages as
// laid out, written by the repository's one PDF writer. The surface takes its printing look (pending suggestions drawn
// accepted, nothing of the editor's own drawn, laid out on pages whatever the view), the pages are read as drawn
// (capture-pages.ts), their pictures drawn (capture-pictures.ts), their structure read from the writing
// (print-tags.ts), the look let go, and the writer loaded and run. A dialog says each step and Cancel stops it between
// steps; a failure says so in it. File > Keep a PDF copy in LiveDoc stores the same PDF as a PDF document beside its
// source, its Subject naming the source (director, 2026-11-28). Print makes its PDF the same way, through `make`.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EditorView } from 'prosemirror-view';
import type { Style } from '@livedoc/text-documents';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { openPdfFile } from '@/lib/pdf-document/open-pdf-file';
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
export const KEEP_PDF_COPY_ITEM = 'keep-pdf-copy';

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
export const KEEP_PDF_COPY_TITLE = 'Keeping a PDF copy';
export const KEEP_PDF_FAILED_COPY = 'The PDF copy couldn’t be kept. Try again.';
export const keptCopy = (name: string) => `Kept a PDF copy of “${name}”.`;

/** Why a PDF is made here: downloaded, or kept in LiveDoc. */
type Purpose = 'download' | 'keep';

/** What the dialog says: a step, a failure, or the copy kept. */
type Shown = {
  readonly purpose: Purpose;
  readonly said: PdfStep | 'failed' | { readonly kept: string };
};

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
  place,
  keep = openPdfFile,
  openTab = (documentId) => window.open(`/document/${documentId}`, '_blank', 'noopener'),
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
  /** Whose and which document this is, and whether it is kept in This Browser: where its PDF copy goes. */
  readonly place: {
    readonly ownerId: string;
    readonly documentId: string;
    readonly local: boolean;
  };
  readonly keep?: typeof openPdfFile;
  readonly openTab?: (documentId: string) => unknown;
}): {
  readonly actions: OfficeActions;
  readonly dialog: ReactNode;
  readonly make: (
    onStep: (step: PdfStep) => void,
    cancelled: () => boolean,
    subject?: string,
  ) => Promise<PdfMade>;
} {
  const laidOut = useRef(pages);
  const look = useRef(printing);
  useEffect(() => {
    laidOut.current = pages;
    look.current = printing;
  }, [pages, printing]);
  const [shown, setShown] = useState<Shown | null>(null);
  const cancel = useRef(false);
  const canvas = useRef<CanvasRenderingContext2D | null>(null);

  const make = useCallback(
    async (
      onStep: (step: PdfStep) => void,
      cancelled: () => boolean,
      subject?: string,
    ): Promise<PdfMade> => {
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
            ...(subject ? { subject } : {}),
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

  /** Makes the PDF for `purpose`, saying each step; the bytes, or null where it was cancelled or failed (said). */
  const made = useCallback(
    async (purpose: Purpose, subject?: string): Promise<Uint8Array<ArrayBuffer> | null> => {
      cancel.current = false;
      setShown({ purpose, said: 'laying-out' });
      const result = await make(
        (step) => setShown({ purpose, said: step }),
        () => cancel.current,
        subject,
      );
      if (cancel.current || (!result.ok && result.cancelled)) {
        debugLog('[text-document] pdf cancelled', { purpose });
        setShown(null);
        return null;
      }
      if (!result.ok) {
        setShown({ purpose, said: 'failed' });
        return null;
      }
      return result.bytes;
    },
    [make],
  );

  const download = useCallback(async () => {
    const bytes = await made('download');
    if (!bytes) return;
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${name}.pdf`);
    track('Document', 'Exported', 'TextDocumentPdf');
    setShown(null);
    onDone?.();
  }, [made, name, onDone]);

  const { ownerId, documentId, local } = place;
  const keepCopy = useCallback(async () => {
    const subject = `Made from ${name} (${window.location.origin}/document/${documentId})`;
    const bytes = await made('keep', subject);
    if (!bytes) return;
    const kept = await keep(
      ownerId,
      { name: `${name}.pdf`, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer },
      undefined,
      local ? 'browser' : 'livedoc',
    );
    if (!kept.ok) {
      debugLog('[text-document] pdf copy refused', { refusal: kept.refusal });
      setShown({ purpose: 'keep', said: 'failed' });
      return;
    }
    debugLog('[text-document] pdf copy kept', {
      documentId: kept.documentId,
      bytes: bytes.byteLength,
    });
    track('Document', 'Exported', 'TextDocumentPdfCopy');
    setShown({ purpose: 'keep', said: { kept: kept.documentId } });
  }, [made, keep, name, ownerId, documentId, local]);

  const actions = useMemo(
    (): OfficeActions => ({
      [DOWNLOAD_PDF_ITEM]: { run: () => void download() },
      [KEEP_PDF_COPY_ITEM]: { run: () => void keepCopy() },
    }),
    [download, keepCopy],
  );
  const close = useCallback(() => {
    cancel.current = true;
    setShown(null);
    onDone?.();
  }, [onDone]);
  const keptId = shown !== null && typeof shown.said === 'object' ? shown.said.kept : null;
  const dialog = (
    <OfficeDialog
      open={shown !== null}
      onClose={close}
      title={shown?.purpose === 'keep' ? KEEP_PDF_COPY_TITLE : PDF_MAKING_TITLE}
      {...(keptId
        ? {
            primary: {
              label: 'Open',
              onPress: () => {
                openTab(keptId);
                close();
              },
            },
          }
        : {})}
    >
      <p role="status" aria-live="polite" className="text-body">
        {shown === null ? '' : messageOf(shown, name)}
      </p>
    </OfficeDialog>
  );
  return { actions, dialog, make };
}

/** What the dialog says: the step under way, the failure of its purpose, or the copy kept. */
function messageOf({ purpose, said }: Shown, name: string): string {
  if (typeof said === 'object') return keptCopy(name);
  if (said === 'failed') return purpose === 'keep' ? KEEP_PDF_FAILED_COPY : PDF_FAILED_COPY;
  return PDF_STEP_COPY[said];
}

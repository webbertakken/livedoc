'use client';

// File > Print and ⌘P on a PDF's surface (docs/specs/035-pdf-documents/files-print-and-sync.md "Printing"): LiveDoc's
// small dialog first, then the print made (pdf-print.ts) and handed to the browser (print-frame.ts). A file that asks
// not to be printed dims Print with the reason, and ⌘P says it; ⌘P is never the browser's print of LiveDoc's page.
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import type * as Y from 'yjs';
import type { Mark, PageInfo, PdfEngine, PdfPermissions } from '@livedoc/pdf-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { PRINT } from './pdf-menus';
import { makePrint, type PdfPrintChoice } from './pdf-print';
import { encodePdfThumbnail } from './pdf-thumbnail-canvas';
import { printInFrame } from './print-frame';

/** Print's label where the file asks not to be printed. */
export const PRINT_NOT_ALLOWED_LABEL = 'Print (this PDF asks not to be printed)';
/** Said when ⌘P meets a file that asks not to be printed. */
export const PRINT_REFUSED_COPY = 'This PDF asks not to be printed.';
/** Said when a print cannot be made. */
export const PRINT_FAILED_COPY = 'This PDF couldn’t be printed.';

export type PdfPrintSource = {
  engine: Pick<PdfEngine, 'bake' | 'cutPages' | 'drawPage'>;
  doc: Y.Doc;
  pages: readonly PageInfo[];
  permissions: PdfPermissions;
  marksOn: (page: PageInfo) => readonly Mark[];
};

/** Whether this browser draws a PDF it is handed; one that says it does not prints pictures (files-print-and-sync.md). */
const printsPdf = (): boolean => navigator.pdfViewerEnabled !== false;

export function usePdfPrint({
  source,
  documentName,
  readStored,
  onProblem,
}: {
  // The open PDF; null while none is.
  source: PdfPrintSource | null;
  documentName: string;
  readStored: () => Promise<Uint8Array<ArrayBuffer>>;
  onProblem: (problem: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const allowed = source?.permissions.print ?? false;

  // Reached only with a PDF open: the action and ⌘P are there only then.
  const open = useCallback(() => {
    if (!allowed) {
      debugLog('[pdf] print-refused');
      onProblem(PRINT_REFUSED_COPY);
      return;
    }
    setAsking(true);
  }, [allowed, onProblem]);

  const print = useCallback(
    async (choice: PdfPrintChoice) => {
      setAsking(false);
      if (!source) return;
      const made = await makePrint(choice, {
        engine: source.engine,
        doc: source.doc,
        documentName,
        readStored,
        pages: source.pages,
        pictures: !source.permissions.printSharp || !printsPdf(),
        marksOn: source.marksOn,
        encode: encodePdfThumbnail,
      }).catch((error: unknown) => {
        debugLog('[pdf] print-failed step=bake', String(error));
        return null;
      });
      if (!made?.ok) return onProblem(PRINT_FAILED_COPY);
      track('Pdf', 'Exported', 'Print');
      await printInFrame(made).catch((error: unknown) => {
        debugLog('[pdf] print-failed step=frame', String(error));
        onProblem(PRINT_FAILED_COPY);
      });
    },
    [source, documentName, readStored, onProblem],
  );

  const actions = useMemo<OfficeActions>(
    () =>
      source
        ? {
            [PRINT]: {
              run: open,
              disabled: !allowed,
              ...(allowed ? {} : { label: PRINT_NOT_ALLOWED_LABEL }),
            },
          }
        : {},
    [source, allowed, open],
  );

  /** ⌘P anywhere on the surface: Print, or why not; true where it was taken. */
  const onKey = useCallback(
    (event: KeyboardEvent<HTMLElement>): boolean => {
      const command = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
      if (!source || !command || event.key.toLowerCase() !== 'p') return false;
      event.preventDefault();
      open();
      return true;
    },
    [source, open],
  );

  return {
    actions,
    onKey,
    dialog: { open: asking, onClose: () => setAsking(false), onPrint: print },
  };
}

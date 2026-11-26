'use client';

// Erase with its tool in hand (docs/specs/035-pdf-documents/marks.md "Changing a mark": Erase): what a page hands over
// once a drag is let go, rubbed out as one step of the person's undo on that page; logged and counted once a drag that
// rubbed out any stroke.
import { useMemo } from 'react';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { eraseStrokes, type Erased } from './pdf-erase';
import type { PdfDocumentOpen } from './usePdfDocument';

type Ready = Pick<Extract<PdfDocumentOpen, { phase: 'ready' }>, 'pages' | 'binding' | 'undo'>;

/** What a page erases with, while Erase is in hand. */
export type PdfPageErasing = {
  // The strokes a drag let go passed over, on the page at `index`.
  readonly onErase: (index: number, erased: readonly Erased[]) => void;
};

export function usePdfErase({ ready, erasing }: { ready: Ready | null; erasing: boolean }) {
  return useMemo<PdfPageErasing | null>(
    () =>
      ready && erasing
        ? {
            onErase: (index, erased) => {
              const page = ready.pages[index];
              if (!page || erased.length === 0) return;
              const done = ready.undo.step({ page: page.name }, () =>
                eraseStrokes(ready.binding.doc, erased, Date.now()),
              );
              if (done.strokes === 0) return;
              debugLog(
                `[pdf] strokes-erased strokes=${done.strokes} marks=${done.marks} deleted=${done.deleted}`,
              );
              track('Pdf', 'Changed', 'Mark.Erased');
            },
          }
        : null,
    [ready, erasing],
  );
}

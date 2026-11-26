'use client';

// The strokes of the Drawing tool made into marks (docs/specs/035-pdf-documents/marks.md "Making a mark": A Drawing):
// each stroke ended is one step of the person's undo, a new Drawing or joined to the one before it on its page.
import { useCallback, useRef } from 'react';
import type { Stroke } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { addStroke, type LastDrawing } from './pdf-drawing';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import type { TextMarkLook } from './pdf-text-mark';
import type { PdfDocumentOpen } from './usePdfDocument';

type Ready = Pick<
  Extract<PdfDocumentOpen, { phase: 'ready' }>,
  'pages' | 'storedFile' | 'binding' | 'undo'
>;

export function usePdfDrawing({
  ready,
  author,
  authorKey,
  look,
  onProblem,
}: {
  ready: Ready | null;
  author: string;
  // The author key this session holds (marks.md "Share roles"): what makes a mark made here its own.
  authorKey: string | null;
  // The Drawing tool's look now.
  look: TextMarkLook;
  onProblem: (problem: string | null) => void;
}) {
  // The Drawing the next stroke may join.
  const last = useRef<LastDrawing | null>(null);
  return useCallback(
    (index: number, stroke: Stroke, begunAt: number) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      const now = Date.now();
      const made = ready.undo.step({ page: page.name }, () =>
        addStroke(
          ready.binding.doc,
          { page: page.name, stored: { blob: ready.storedFile, pages: ready.pages.length } },
          stroke,
          { author, authorKey, now, begunAt, id: crypto.randomUUID(), look, last: last.current },
        ),
      );
      if (made.ok) {
        last.current = { id: made.mark.id, page: page.name, endedAt: now };
        if (made.joined) debugLog(`[pdf] drawing-joined strokes=${made.mark.strokes.length}`);
        else {
          debugLog('[pdf] mark-added kind=drawing');
          track('Pdf', 'Added', 'Mark.Drawing');
        }
        onProblem(null);
      } else if (made.reason === 'pdf_too_many_marks') {
        debugLog('[pdf] limit-refused name=pdf_too_many_marks');
        onProblem(TOO_MANY_MARKS_COPY);
      } else debugLog(`[pdf] mark-refused name=${made.reason}`);
    },
    [ready, author, authorKey, look, onProblem],
  );
}

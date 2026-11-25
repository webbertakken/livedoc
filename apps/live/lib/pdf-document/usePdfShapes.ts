'use client';

// The lines and shapes of the shape tools made into marks (docs/specs/035-pdf-documents/marks.md "Making a mark"): each
// drag let go is one step of the person's undo, in its kind's look; a press alone makes nothing.
import { useCallback } from 'react';
import type { BoxShape, LineShape } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { MarkLooks } from './pdf-mark-looks';
import { addShape, SHAPE_NAMES } from './pdf-shape';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import type { PdfDocumentOpen } from './usePdfDocument';

type Ready = Pick<
  Extract<PdfDocumentOpen, { phase: 'ready' }>,
  'pages' | 'storedFile' | 'binding' | 'undo'
>;

export function usePdfShapes({
  ready,
  author,
  authorKey,
  looks,
  onProblem,
}: {
  ready: Ready | null;
  author: string;
  // The author key this session holds (marks.md "Share roles"): what makes a mark made here its own.
  authorKey: string | null;
  // Each kind's look now.
  looks: MarkLooks;
  onProblem: (problem: string | null) => void;
}) {
  return useCallback(
    (index: number, shape: LineShape | BoxShape | null) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      const made = ready.undo.step({ page: page.name }, () =>
        addShape(
          ready.binding.doc,
          { page: page.name, stored: { blob: ready.storedFile, pages: ready.pages.length } },
          shape,
          {
            author,
            authorKey,
            now: Date.now(),
            id: crypto.randomUUID(),
            look: looks[shape?.kind ?? 'line'],
          },
        ),
      );
      if (made.ok) {
        debugLog(`[pdf] mark-added kind=${made.mark.kind}`);
        track('Pdf', 'Added', `Mark.${SHAPE_NAMES[shape!.kind]}`);
        onProblem(null);
      } else if (made.reason === 'pdf_too_many_marks') {
        debugLog('[pdf] limit-refused name=pdf_too_many_marks');
        onProblem(TOO_MANY_MARKS_COPY);
      } else debugLog(`[pdf] mark-refused name=${made.reason}`);
    },
    [ready, author, authorKey, looks, onProblem],
  );
}

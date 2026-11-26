'use client';

// Format > Rotate on the selected stamps (docs/specs/035-pdf-documents/marks.md "Changing a mark": A stamp's quarter
// turns): Clockwise and Counterclockwise each one step of the person's undo on the page, dimmed with no stamp selected.
// Marks are Reviewing's: outside it nothing here is offered.
import { useMemo } from 'react';
import { PDF_MAX_COORDINATE, type Box, type PageInfo } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import type { PdfChangeableStore } from './pdf-changeable-marks';
import { TURN_ITEMS, turnStamps } from './pdf-stamp-turns';
import { pageBoxOf } from './pdf-typed';
import type { PdfDocumentOpen } from './usePdfDocument';
import { usePdfChosenMarks } from './usePdfChosenMarks';
import { fileOwnOf, type PdfMarksChosen } from './usePdfMarkSelection';

type Ready = Pick<
  Extract<PdfDocumentOpen, { phase: 'ready' }>,
  'pages' | 'engine' | 'binding' | 'undo'
>;

const NO_PAGES: readonly PageInfo[] = [];
/** Where a page cannot be read, a box held to no page. */
const NO_PAGE: Box = [
  -PDF_MAX_COORDINATE,
  -PDF_MAX_COORDINATE,
  PDF_MAX_COORDINATE,
  PDF_MAX_COORDINATE,
];

export function usePdfStampTurns({
  ready,
  marks,
  marking,
  chosen,
}: {
  ready: Ready | null;
  marks: PdfChangeableStore | null;
  // Whether marks may be changed now: Reviewing, for a session that reviews.
  marking: boolean;
  chosen: PdfMarksChosen | null;
}): OfficeActions {
  const { byPage, page, selected } = usePdfChosenMarks({
    pages: ready?.pages ?? NO_PAGES,
    marks,
    chosen,
  });
  const stamps = selected.some((mark) => mark.kind === 'stamp');

  return useMemo((): OfficeActions => {
    if (!ready || !marking) return {};
    const turn = (way: (typeof TURN_ITEMS)[string]) => {
      if (!chosen || !page) return;
      void ready.engine.pageMatrix(chosen.page, 0).then((matrix) => {
        const box = matrix ? pageBoxOf(matrix, page) : NO_PAGE;
        const turned = ready.undo.step({ page: page.name }, () =>
          turnStamps(
            ready.binding.doc,
            chosen.ids,
            way,
            box,
            Date.now(),
            fileOwnOf(byPage, page.name),
          ),
        );
        if (turned === 0) return;
        debugLog(`[pdf] stamps-turned count=${turned} way=${way}`);
        track('Pdf', 'Changed', 'Mark.Turned');
      });
    };
    return Object.fromEntries(
      Object.entries(TURN_ITEMS).map(([item, way]) => [
        item,
        { run: () => turn(way), disabled: !stamps },
      ]),
    );
  }, [ready, marking, chosen, page, byPage, stamps]);
}

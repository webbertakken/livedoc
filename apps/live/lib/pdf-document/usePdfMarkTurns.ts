'use client';

// Marks turned (docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate): Format > Rotate's Clockwise and
// Counterclockwise on every selected mark that turns, dimmed with none of them selected; and `pageBoxAt`, the
// way a page's box is read for them to be held on. Marks are Reviewing's: outside it nothing here is offered.
import { useMemo } from 'react';
import {
  Mark,
  PDF_MAX_COORDINATE,
  type Box,
  type PageInfo,
  type PdfEngine,
} from '@livedoc/pdf-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { PdfChangeableStore } from './pdf-changeable-marks';
import { turnMarksOn } from './pdf-mark-turn-step';
import { TURN_ITEMS } from './pdf-mark-turns';
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

/** The page box of the page at `index`, as the engine draws it; no page where it cannot be read. */
export async function pageBoxAt(
  engine: Pick<PdfEngine, 'pageMatrix'>,
  index: number,
  page: PageInfo,
): Promise<Box> {
  const matrix = await engine.pageMatrix(index, 0);
  return matrix ? pageBoxOf(matrix, page) : NO_PAGE;
}

export function usePdfMarkTurns({
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
  const turning = selected.some((mark) => Mark.turns(mark) !== null);

  return useMemo((): OfficeActions => {
    if (!ready || !marking) return {};
    const turn = (way: (typeof TURN_ITEMS)[string]) => {
      if (!chosen || !page) return;
      void pageBoxAt(ready.engine, chosen.page, page).then((box) =>
        turnMarksOn({
          ready,
          page,
          box,
          ids: chosen.ids,
          asked: way,
          way,
          fileOwn: fileOwnOf(byPage, page.name),
        }),
      );
    };
    return Object.fromEntries(
      Object.entries(TURN_ITEMS).map(([item, way]) => [
        item,
        { run: () => turn(way), disabled: !turning },
      ]),
    );
  }, [ready, marking, chosen, page, byPage, turning]);
}

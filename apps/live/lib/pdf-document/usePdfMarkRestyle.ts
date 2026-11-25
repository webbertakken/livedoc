'use client';

// Restyling the selected marks (docs/specs/035-pdf-documents/marks.md "Changing a mark"): the toolbar's Colour is
// theirs while Select is in hand, blank where they differ, Reset giving each its kind's first look; its Fill the
// selected Rectangles' and Ellipses', led by None; its Font size the selected Texts' and Callouts', held within its
// range, a box that grows past the page's foot moved up onto it; Format > Opacity, Line width, Line style, Line ends
// and Align text set a step, checked where every mark it reaches holds it, dimmed while none has what it sets. Each
// restyle is one step of the person's undo, and gives the pages the keys. Marks are Reviewing's: while `marking` is
// off nothing is bound.
import { useMemo, useSyncExternalStore } from 'react';
import {
  PDF_MAX_COORDINATE,
  PDF_TEXT_SIZE_MAX_PT,
  PDF_TEXT_SIZE_MIN_PT,
  type Box,
  type Mark,
  type MarkChange,
} from '@livedoc/pdf-documents';
import type { OfficeColours } from '@/components/office/OfficeColourControl';
import type { OfficeFontSize } from '@/components/office/OfficeFontSizeField';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  ALIGN_ITEMS,
  alignOf,
  END_ITEMS,
  fillOf,
  firstColour,
  lineEndOf,
  lineStyleOf,
  OPACITY_ITEMS,
  restyleMarks,
  sharedOf,
  sizedLook,
  sizeOf,
  STYLE_ITEMS,
  WIDTH_ITEMS,
  widthOf,
  type RestyledLook,
} from './pdf-mark-restyle';
import {
  changeableOnPage,
  type PdfChangeableByPage,
  type PdfChangeableStore,
} from './pdf-changeable-marks';
import { FILL_COLOUR, TOOL_COLOUR } from './pdf-toolbar';
import { pageBoxOf } from './pdf-typed';
import type { PdfDocumentOpen } from './usePdfDocument';
import { fileOwnOf, type PdfMarksChosen } from './usePdfMarkSelection';

type Ready = Pick<
  Extract<PdfDocumentOpen, { phase: 'ready' }>,
  'pages' | 'engine' | 'binding' | 'undo'
>;

const NO_MARKS: PdfChangeableByPage = new Map();
const NONE: readonly Mark[] = [];
const neverChanges = () => () => {};
const noMarks = () => NO_MARKS;
/** Where a page cannot be read, a box held to no page. */
const NO_PAGE: Box = [
  -PDF_MAX_COORDINATE,
  -PDF_MAX_COORDINATE,
  PDF_MAX_COORDINATE,
  PDF_MAX_COORDINATE,
];

/** A size taken, held within the range a Text's words may be. */
const heldSize = (pt: number): number =>
  Math.min(PDF_TEXT_SIZE_MAX_PT, Math.max(PDF_TEXT_SIZE_MIN_PT, pt));

/** The fill the shapes selected share: none as undefined, null where they differ. */
function sharedFill(fills: readonly (string | null)[]): string | null | undefined {
  const first = fills[0] ?? null;
  if (fills.some((fill) => fill !== first)) return null;
  return first ?? undefined;
}

export function usePdfMarkRestyle({
  ready,
  marks,
  marking,
  chosen,
  focusPages,
}: {
  // The open PDF and the marks a person may change, by page; null before it is.
  ready: Ready | null;
  marks: PdfChangeableStore | null;
  // Whether marks may be changed now: Reviewing, for a session that reviews.
  marking: boolean;
  // The marks selected; null while none is.
  chosen: PdfMarksChosen | null;
  // Gives the pages the keys, once a restyle is made.
  focusPages: () => void;
}) {
  const read = marks?.get ?? noMarks;
  const byPage = useSyncExternalStore(marks?.subscribe ?? neverChanges, read, read);
  const page = chosen ? ready?.pages[chosen.page] : undefined;
  const selected = useMemo(
    () =>
      chosen && page
        ? changeableOnPage(byPage, page.name).marks.filter((mark) => chosen.ids.includes(mark.id))
        : NONE,
    [byPage, chosen, page],
  );

  return useMemo(() => {
    if (!marking || !ready) return { colours: {}, actions: {}, fontSize: null };
    const restyle = (look: RestyledLook, lookOf: (mark: Mark) => MarkChange) => {
      if (!chosen || !page) return;
      const changed = ready.undo.step({ page: page.name }, () =>
        restyleMarks(
          ready.binding.doc,
          chosen.ids,
          lookOf,
          Date.now(),
          fileOwnOf(byPage, page.name),
        ),
      );
      if (changed > 0) {
        debugLog(`[pdf] marks-restyled count=${changed} look=${look}`);
        track('Pdf', 'Changed', 'Mark.Restyled');
      }
      focusPages();
    };
    const fills = selected.flatMap((mark) => {
      const fill = fillOf(mark);
      return fill === undefined ? [] : [fill];
    });
    const colours: OfficeColours = {
      ...(selected.length > 0
        ? {
            [TOOL_COLOUR]: {
              read: () => sharedOf(selected, (mark) => mark.colour),
              set: (colour) =>
                restyle('colour', (mark) => ({ colour: colour ?? firstColour(mark) })),
              leading: 'Reset',
            },
          }
        : {}),
      ...(fills.length > 0
        ? {
            [FILL_COLOUR]: {
              read: () => sharedFill(fills),
              set: (fill) => restyle('fill', () => ({ fill })),
              leading: 'None',
            },
          }
        : {}),
    };
    const opacity = sharedOf(selected, (mark) => mark.opacity);
    const width = sharedOf(selected, widthOf);
    const style = sharedOf(selected, lineStyleOf);
    const lined = selected.some((mark) => widthOf(mark) !== undefined);
    const end = sharedOf(selected, lineEndOf);
    const ended = selected.some((mark) => lineEndOf(mark) !== undefined);
    const sized = selected.some((mark) => sizeOf(mark) !== undefined);
    const fontSize: OfficeFontSize | null =
      sized && chosen && page
        ? {
            read: () => sharedOf(selected, sizeOf),
            set: (pt) => {
              // The page's box in page space, as the file has it, so a box that grows stays on it.
              void ready.engine.pageMatrix(chosen.page, 0).then((matrix) => {
                const box = matrix ? pageBoxOf(matrix, page) : NO_PAGE;
                restyle('size', sizedLook(heldSize(pt), box));
              });
            },
          }
        : null;
    const align = sharedOf(selected, alignOf);
    const actions: OfficeActions = {
      ...Object.fromEntries(
        Object.entries(OPACITY_ITEMS).map(([id, value]) => [
          id,
          {
            run: () => restyle('opacity', () => ({ opacity: value })),
            checked: opacity === value,
            disabled: selected.length === 0,
          },
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(WIDTH_ITEMS).map(([id, value]) => [
          id,
          {
            run: () => restyle('width', () => ({ width: value })),
            checked: width === value,
            disabled: !lined,
          },
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(STYLE_ITEMS).map(([id, value]) => [
          id,
          {
            run: () => restyle('style', () => ({ lineStyle: value })),
            checked: style === value,
            disabled: !lined,
          },
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(END_ITEMS).map(([id, value]) => [
          id,
          {
            run: () => restyle('end', () => ({ lineEnd: value })),
            checked: end === value,
            disabled: !ended,
          },
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(ALIGN_ITEMS).map(([id, value]) => [
          id,
          {
            run: () => restyle('align', () => ({ align: value })),
            checked: align === value,
            disabled: !sized,
          },
        ]),
      ),
    };
    return { colours, actions, fontSize };
  }, [ready, chosen, page, selected, marking, focusPages, byPage]);
}

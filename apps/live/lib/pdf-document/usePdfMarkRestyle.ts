'use client';

// Restyling the selected marks (docs/specs/035-pdf-documents/marks.md "Changing a mark"): the toolbar's Colour is
// theirs while Select is in hand, blank where they differ, Reset giving each its kind's first look; Format > Opacity and
// Line width set a step, checked where every mark it reaches holds it, dimmed while none has what it sets. Each restyle
// is one step of the person's undo, and gives the pages the keys. Marks are Reviewing's: while `marking` is off nothing
// is bound.
import { useMemo, useSyncExternalStore } from 'react';
import type { Mark, MarkLook } from '@livedoc/pdf-documents';
import type { OfficeColours } from '@/components/office/OfficeColourControl';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  firstColour,
  OPACITY_ITEMS,
  restyleMarks,
  sharedOf,
  WIDTH_ITEMS,
  widthOf,
  type RestyledLook,
} from './pdf-mark-restyle';
import { marksOnPage, type PdfMarksByPage, type PdfMarksStore } from './pdf-marks-store';
import { TOOL_COLOUR } from './pdf-toolbar';
import type { PdfDocumentOpen } from './usePdfDocument';
import type { PdfMarksChosen } from './usePdfMarkSelection';

type Ready = Pick<Extract<PdfDocumentOpen, { phase: 'ready' }>, 'pages' | 'binding' | 'undo'>;

const NO_MARKS: PdfMarksByPage = new Map();
const NONE: readonly Mark[] = [];
const neverChanges = () => () => {};
const noMarks = () => NO_MARKS;

export function usePdfMarkRestyle({
  ready,
  marks,
  marking,
  chosen,
  focusPages,
}: {
  // The open PDF and its marks by page; null before it is.
  ready: Ready | null;
  marks: PdfMarksStore | null;
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
        ? marksOnPage(byPage, page.name).filter((mark) => chosen.ids.includes(mark.id))
        : NONE,
    [byPage, chosen, page],
  );

  return useMemo(() => {
    if (!marking || !ready) return { colours: {}, actions: {} };
    const restyle = (look: RestyledLook, lookOf: (mark: Mark) => MarkLook) => {
      if (!chosen || !page) return;
      const changed = ready.undo.step({ page: page.name }, () =>
        restyleMarks(ready.binding.doc, chosen.ids, lookOf, Date.now()),
      );
      if (changed > 0) {
        debugLog(`[pdf] marks-restyled count=${changed} look=${look}`);
        track('Pdf', 'Changed', 'Mark.Restyled');
      }
      focusPages();
    };
    const colours: OfficeColours =
      selected.length > 0
        ? {
            [TOOL_COLOUR]: {
              read: () => sharedOf(selected, (mark) => mark.colour),
              set: (colour) =>
                restyle('colour', (mark) => ({ colour: colour ?? firstColour(mark) })),
              leading: 'Reset',
            },
          }
        : {};
    const opacity = sharedOf(selected, (mark) => mark.opacity);
    const width = sharedOf(selected, widthOf);
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
            disabled: !selected.some((mark) => widthOf(mark) !== undefined),
          },
        ]),
      ),
    };
    return { colours, actions };
  }, [ready, chosen, page, selected, marking, focusPages]);
}

'use client';

// A tool's line (docs/specs/035-pdf-documents/marks.md "Making a mark": A tool's line): with the Drawing, Line, Arrow,
// Rectangle or Ellipse tool in hand, Format > Line width and Line style, and so the toolbar's Line width, set that
// tool's width and style, its step checked; with the Rectangle or Ellipse tool in hand the toolbar's Fill, led by None,
// sets its fill. Each is kept for the kind, and a pick gives the pages the keys again. With any other tool in hand
// nothing is bound here, and the selected marks' restyle answers instead.
import { useMemo } from 'react';
import type { OfficeColours } from '@/components/office/OfficeColourControl';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { isFilledKind, isLinedKind, setMarkLine, type MarkLooks } from './pdf-mark-looks';
import { STYLE_ITEMS, WIDTH_ITEMS } from './pdf-mark-restyle';
import { FILL_COLOUR } from './pdf-toolbar';
import type { PdfPageTool } from './usePdfMarkTools';

const NOTHING = { actions: {}, colours: {} } as const;

export function usePdfToolLine({
  inHand,
  looks,
  focusPages,
}: {
  // The tool in hand: Select while marks may not be made.
  inHand: PdfPageTool;
  // Each kind's look now.
  looks: MarkLooks;
  // Gives the pages the keys, once a step or a fill is picked.
  focusPages: () => void;
}): { actions: OfficeActions; colours: OfficeColours } {
  return useMemo(() => {
    if (!isLinedKind(inHand)) return NOTHING;
    const kind = inHand;
    const look = looks[kind];
    const chosen = (part: 'width' | 'style' | 'fill', taken: boolean) => {
      if (taken) {
        debugLog(`[pdf] tool-look kind=${kind} look=${part}`);
        track('Pdf', 'Changed', 'ToolLine');
      }
      focusPages();
    };
    const actions: OfficeActions = {
      ...Object.fromEntries(
        Object.entries(WIDTH_ITEMS).map(([id, width]) => [
          id,
          {
            run: () => chosen('width', setMarkLine(kind, { width })),
            checked: look.width === width,
          },
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(STYLE_ITEMS).map(([id, lineStyle]) => [
          id,
          {
            run: () => chosen('style', setMarkLine(kind, { lineStyle })),
            checked: (look.lineStyle ?? 'solid') === lineStyle,
          },
        ]),
      ),
    };
    const colours: OfficeColours = isFilledKind(kind)
      ? {
          [FILL_COLOUR]: {
            read: () => look.fill,
            set: (fill) => chosen('fill', setMarkLine(kind, { fill })),
            leading: 'None',
          },
        }
      : {};
    return { actions, colours };
  }, [inHand, looks, focusPages]);
}

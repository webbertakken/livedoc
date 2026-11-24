'use client';

// The Stamp tool (docs/specs/035-pdf-documents/marks.md "Stamps"; reading-surface.md "The toolbar"): the Stamp
// control, holding every stamp behind its chevron in a grid a category, each drawn as it looks; Insert > Stamp's
// Standard stamps and Dynamic stamps; and a press on a page with the tool in hand placing the stamp the control shows,
// one step of the person's undo. The tool in hand is usePdfMarkTools'; this names what takes it.
import { useCallback, useMemo } from 'react';
import { lucideStamp } from '@livedoc/icons/lucide';
import { STAMPS, Stamps, type Box, type PagePoint, type Stamp } from '@livedoc/pdf-documents';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { STAMP_DYNAMIC, STAMP_STANDARD } from './pdf-menus';
import { addStamp, STAMP_COLOURS, stampKindName } from './pdf-stamp';
import { setStampPick, useStampPick } from './pdf-stamp-pick';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { STAMP_TOOLS } from './pdf-toolbar';
import type { PdfDocumentOpen } from './usePdfDocument';
import type { PdfPageTool } from './usePdfMarkTools';

type Ready = Pick<
  Extract<PdfDocumentOpen, { phase: 'ready' }>,
  'pages' | 'storedFile' | 'binding' | 'undo'
>;

/** What a page does with a press while the Stamp tool is in hand: places the stamp, in the page's box. */
export type PdfPageStamping = {
  readonly onStamp: (index: number, at: PagePoint, page: Box) => void;
};

/** (default) The Stamp control's grid: three stamps to a row. */
const STAMP_COLUMNS = 3;

/** A stamp's cell in the Stamp control's grid, by which its action runs. */
export const stampCell = (id: string): string => `stamp-pick-${id}`;

/** A stamp's name as the grid and the control say it: a dynamic one says what it adds. */
export const stampLabel = (stamp: Stamp): string =>
  stamp.dynamic ? `${stamp.name}, with name and time` : stamp.name;

const GRID = {
  columns: STAMP_COLUMNS,
  wide: true,
  cells: STAMPS.map((stamp) => ({
    id: stampCell(stamp.id),
    label: stampLabel(stamp),
    badge: {
      text: stamp.name.toUpperCase(),
      detail: stamp.dynamic ? 'by name, time' : null,
      colour: STAMP_COLOURS[stamp.tone],
    },
  })),
  sections: [
    { label: 'Standard', count: Stamps.standard.length },
    { label: 'Dynamic', count: Stamps.dynamic.length },
  ],
};

export function usePdfStampTool({
  ready,
  author,
  offered,
  inHand,
  pickTool,
  onProblem,
}: {
  // The open PDF; null before it is.
  ready: Ready | null;
  // The display name a stamp placed here carries, and a dynamic stamp writes.
  author: string;
  // Whether the Stamp tool may be taken now: an open PDF, in Reviewing, for a session that reviews.
  offered: boolean;
  inHand: PdfPageTool;
  pickTool: (tool: PdfPageTool) => void;
  // What the title row says went wrong; null once a stamp is placed.
  onProblem: (problem: string | null) => void;
}) {
  const pick = useStampPick();
  const stamp = Stamps.of(pick)!;

  const take = useCallback(
    (id: string) => {
      setStampPick(id);
      pickTool('stamp');
    },
    [pickTool],
  );

  const onStamp = useCallback(
    (index: number, at: PagePoint, box: Box) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      const made = ready.undo.step({ page: page.name }, () =>
        addStamp(
          ready.binding.doc,
          { page: page.name, stored: { blob: ready.storedFile, pages: ready.pages.length }, box },
          stamp,
          at,
          { author, now: Date.now(), id: crypto.randomUUID() },
        ),
      );
      if (made.ok) {
        debugLog('[pdf] mark-added kind=stamp');
        track('Pdf', 'Added', `Stamp.${stampKindName(stamp)}`);
        onProblem(null);
      } else if (made.reason === 'pdf_too_many_marks') {
        debugLog('[pdf] limit-refused name=pdf_too_many_marks');
        onProblem(TOO_MANY_MARKS_COPY);
      } else debugLog(`[pdf] mark-refused name=${made.reason}`);
    },
    [ready, author, stamp, onProblem],
  );
  const stamping = useMemo<PdfPageStamping | null>(
    () => (inHand === 'stamp' ? { onStamp } : null),
    [inHand, onStamp],
  );

  const actions = useMemo<OfficeActions>(() => {
    if (!offered) return {};
    const cells = Object.fromEntries(
      STAMPS.map(({ id }) => [
        stampCell(id),
        { run: () => take(id), checked: inHand === 'stamp' && pick === id },
      ]),
    );
    return {
      ...cells,
      // Insert > Stamp: the stamp the control shows where it is of the category, else the category's first.
      [STAMP_STANDARD]: { run: () => take(stamp.dynamic ? Stamps.standard[0]!.id : pick) },
      [STAMP_DYNAMIC]: { run: () => take(stamp.dynamic ? pick : Stamps.dynamic[0]!.id) },
      // The control: the stamp last taken; pressed again, back to Select.
      [STAMP_TOOLS]: {
        run: () => pickTool(inHand === 'stamp' ? 'select' : 'stamp'),
        checked: inHand === 'stamp',
        label: `Stamp: ${stampLabel(stamp)}`,
      },
    };
  }, [offered, inHand, pick, stamp, take, pickTool]);

  const choices = useMemo<OfficeChoices>(
    (): OfficeChoices =>
      offered
        ? {
            [STAMP_TOOLS]: {
              read: () => stampCell(pick),
              entries: [],
              actions,
              iconOf: () => lucideStamp,
              grid: GRID,
            },
          }
        : {},
    [offered, pick, actions],
  );

  return { actions, choices, stamping };
}

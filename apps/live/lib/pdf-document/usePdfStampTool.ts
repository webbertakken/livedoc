'use client';

// The Stamp tool (docs/specs/035-pdf-documents/marks.md "Stamps"; reading-surface.md "The toolbar"): the Stamp
// control, holding every stamp behind its chevron in a grid a category, each drawn as it looks; Insert > Stamp's
// Standard stamps and Dynamic stamps; and a press on a page with the tool in hand placing the stamp the control shows,
// one step of the person's undo. A person's custom stamps (custom-stamps.md) join the grid after them, with Insert >
// Stamp > Custom stamps and the grid's Create custom stamp… opening Create custom stamp (usePdfCustomStamps'); a
// custom stamp taken that is theirs no longer reads as Approved. The tool in hand is usePdfMarkTools'; this names what
// takes it.
import { useCallback, useMemo } from 'react';
import { lucideStamp } from '@livedoc/icons/lucide';
import {
  CustomStamp,
  STAMPS,
  Stamps,
  type Box,
  type CustomStampRecord,
  type PagePoint,
  type Stamp,
} from '@livedoc/pdf-documents';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { STAMP_CUSTOM, STAMP_DYNAMIC, STAMP_MANAGE, STAMP_STANDARD } from './pdf-menus';
import { addStamp, STAMP_COLOURS, stampKindName } from './pdf-stamp';
import { setStampPick, useStampPick } from './pdf-stamp-pick';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { STAMP_TOOLS } from './pdf-toolbar';
import type { PdfDocumentOpen } from './usePdfDocument';
import type { PdfPageTool } from './usePdfMarkTools';
import type { PdfStampIdentity } from './usePdfStampIdentity';
import {
  CREATE_CUSTOM_STAMP_CELL,
  usePdfCustomStamps,
  type PdfCustomStampsHome,
} from './usePdfCustomStamps';

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

const APPROVED = Stamps.of('approved')!;

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
  authorKey,
  offered,
  inHand,
  pickTool,
  onProblem,
  custom,
  identity,
}: {
  // The open PDF; null before it is.
  ready: Ready | null;
  // The display name a stamp placed here carries, and a dynamic stamp writes.
  author: string;
  // The author key this session holds (marks.md "Share roles"): what makes a mark made here its own.
  authorKey: string | null;
  // Whether the Stamp tool may be taken now: an open PDF, in Reviewing, for a session that reviews.
  offered: boolean;
  inHand: PdfPageTool;
  pickTool: (tool: PdfPageTool) => void;
  // What the title row says went wrong; null once a stamp is placed.
  onProblem: (problem: string | null) => void;
  // Where custom stamps come from and go; null where they are not offered (no file storage).
  custom: PdfCustomStampsHome | null;
  // The person's stamp identity: a dynamic stamp placed here is given it, and Manage stamps fills it in.
  identity: PdfStampIdentity;
}) {
  const pick = useStampPick();

  const take = useCallback(
    (id: string) => {
      setStampPick(id);
      pickTool('stamp');
    },
    [pickTool],
  );
  const customs = usePdfCustomStamps({
    home: custom,
    offered,
    identity,
    cellOf: stampCell,
    take,
  });
  // The stamp the control shows: a standard or dynamic one, a custom stamp still theirs, else Approved.
  const mine: CustomStampRecord | null = CustomStamp.isId(pick)
    ? (customs.stamps.find((kept) => kept.id === pick) ?? null)
    : null;
  const stamp = Stamps.of(pick) ?? APPROVED;
  const shown = mine ? mine.id : stamp.id;
  const label = mine ? mine.name : stampLabel(stamp);
  const { place } = customs;

  const onStamp = useCallback(
    (index: number, at: PagePoint, box: Box) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      if (mine) {
        place(ready, mine, { index, at, box }, { author, authorKey }, onProblem);
        return;
      }
      const made = ready.undo.step({ page: page.name }, () =>
        addStamp(
          ready.binding.doc,
          { page: page.name, stored: { blob: ready.storedFile, pages: ready.pages.length }, box },
          stamp,
          at,
          {
            author,
            authorKey,
            now: Date.now(),
            identity: identity.identity,
            id: crypto.randomUUID(),
          },
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
    [ready, author, authorKey, identity.identity, stamp, mine, place, onProblem],
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
        { run: () => take(id), checked: inHand === 'stamp' && shown === id },
      ]),
    );
    const custom = customs.enabled
      ? {
          ...Object.fromEntries(
            customs.stamps.map(({ id }) => [
              stampCell(id),
              { run: () => take(id), checked: inHand === 'stamp' && shown === id },
            ]),
          ),
          [CREATE_CUSTOM_STAMP_CELL]: { run: customs.openDialog },
          [STAMP_CUSTOM]: { run: customs.openDialog },
        }
      : {};
    return {
      ...cells,
      ...custom,
      // Manage stamps holds the person's identity: offered wherever the Stamp tool is, file storage or none.
      [STAMP_MANAGE]: { run: customs.openManage },
      // Insert > Stamp: the stamp the control shows where it is of the category, else the category's first.
      [STAMP_STANDARD]: {
        run: () => take(mine || stamp.dynamic ? Stamps.standard[0]!.id : stamp.id),
      },
      [STAMP_DYNAMIC]: {
        run: () => take(!mine && stamp.dynamic ? stamp.id : Stamps.dynamic[0]!.id),
      },
      // The control: the stamp last taken; pressed again, back to Select.
      [STAMP_TOOLS]: {
        run: () => pickTool(inHand === 'stamp' ? 'select' : 'stamp'),
        checked: inHand === 'stamp',
        label: `Stamp: ${label}`,
      },
    };
  }, [offered, inHand, shown, stamp, mine, label, customs, take, pickTool]);

  const grid = useMemo(
    () => ({
      ...GRID,
      cells: [...GRID.cells, ...customs.grid.cells],
      sections: [...GRID.sections, ...customs.grid.sections],
    }),
    [customs.grid],
  );
  const choices = useMemo<OfficeChoices>(
    (): OfficeChoices =>
      offered
        ? {
            [STAMP_TOOLS]: {
              read: () => stampCell(shown),
              entries: [],
              actions,
              iconOf: () => lucideStamp,
              grid,
            },
          }
        : {},
    [offered, shown, actions, grid],
  );

  return {
    actions,
    choices,
    stamping,
    customStampDialog: customs.dialog,
    manageStampsDialog: customs.manageDialog,
  };
}

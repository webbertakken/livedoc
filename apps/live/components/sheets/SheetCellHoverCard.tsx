'use client';

// A cell's note and comment thread on hover (docs/specs/029-sheets/review.md "Notes", "In the grid", D644): the pointer
// resting on a noted or anchored cell for a moment shows a read-only card at the cell's top right, the note first,
// then the thread's first comment, its author and how many more it holds. The note box hides the note while open on
// that cell, and the thread's card the thread. The markers are drawn with the cells (SheetCells).
import { cellKey } from '@livedoc/sheets';
import type { SheetThread } from '@livedoc/document';
import { useDelayedReveal } from '@/hooks/ui/useDelayedReveal';
import { moreCommentsLabel } from '@/lib/spreadsheet/sheet-comments';
import { NOTE_CARD_DELAY_MS } from '@/lib/spreadsheet/sheet-notes';
import { readWorkbook } from './read-workbook';
import { useSheetController } from './sheet-controller';
import { cellBox, mergeAt } from './sheet-geometry';
import { useOpenNoteCell } from './sheet-note-open-context';
import { useSheetThreadMarks } from './sheet-thread-marks-context';
import { SheetCellSlot } from './SheetCellSlot';

type Box = { x: number; y: number; w: number; h: number };

export function SheetCellHoverCard({ hover }: { hover: { r: number; c: number } | null }) {
  const c = useSheetController();
  const open = useOpenNoteCell();
  const marks = useSheetThreadMarks();
  // A merged cell's note and thread are its top-left cell's.
  const merge = hover ? mergeAt(c.geometry, hover.r, hover.c) : null;
  const at = merge ? { r: merge.r1, c: merge.c1 } : hover;
  const read =
    at && !c.editing
      ? readWorkbook(c.version, () => {
          const rowId = c.sheet.layout.rows[at.r];
          const colId = c.sheet.layout.cols[at.c];
          return {
            note: c.workbook.cellNoteOf(c.sheet.id, at.r, at.c),
            key: rowId !== undefined && colId !== undefined ? cellKey(rowId, colId) : null,
          };
        })
      : null;
  if (!at || !read) return null;
  const noteOpen = !!open && open.sheetId === c.sheet.id && open.r === at.r && open.c === at.c;
  const note = noteOpen ? null : read.note;
  const thread =
    read.key !== null && marks && marks.openCell !== read.key
      ? (marks.byCell.get(read.key) ?? null)
      : null;
  if (note === null && thread === null) return null;
  const box = cellBox(c.geometry, at.r, at.c, c.scroll, merge);
  // Keyed by the cell, so moving to another noted or anchored cell waits the moment again.
  return <HoverCard key={`${at.r},${at.c}`} at={at} box={box} note={note} thread={thread} />;
}

function HoverCard({
  at,
  box,
  note,
  thread,
}: {
  at: { r: number; c: number };
  box: Box;
  note: string | null;
  thread: SheetThread | null;
}) {
  const shown = useDelayedReveal(NOTE_CARD_DELAY_MS);
  if (!shown) return null;
  const first = thread?.comments[0];
  const more = thread ? moreCommentsLabel(thread) : null;
  return (
    <SheetCellSlot r={at.r} c={at.c}>
      <div
        role="tooltip"
        {...(note !== null ? { 'data-sheet-note-card': '' } : {})}
        {...(first ? { 'data-sheet-comment-card': '' } : {})}
        className="pointer-events-none absolute z-[10] flex max-h-60 w-56 flex-col gap-2 overflow-hidden rounded-menu border border-slate-200 bg-white px-3 py-2 text-supporting text-slate-800 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        style={{ left: box.x + box.w + 2, top: box.y }}
      >
        {note !== null ? <p className="whitespace-pre-wrap break-words">{note}</p> : null}
        {first ? (
          <div
            className={note !== null ? 'border-t border-slate-200 pt-2 dark:border-slate-700' : ''}
          >
            <p className="font-medium">{first.author.name}</p>
            <p className="line-clamp-4 whitespace-pre-wrap break-words">{first.text}</p>
            {more ? <p className="text-slate-600 dark:text-slate-300">{more}</p> : null}
          </div>
        ) : null}
      </div>
    </SheetCellSlot>
  );
}

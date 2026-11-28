'use client';

// A cell's note on hover (docs/specs/029-sheets/review.md "Notes"): the pointer resting on a noted cell for a moment
// shows its note, read-only, in a card at the cell's top right; the note box replaces it while open on that cell. The
// markers are drawn with the cells (SheetCells).
import { useDelayedReveal } from '@/hooks/ui/useDelayedReveal';
import { NOTE_CARD_DELAY_MS } from '@/lib/spreadsheet/sheet-notes';
import { readWorkbook } from './read-workbook';
import { useSheetController } from './sheet-controller';
import { cellBox, mergeAt } from './sheet-geometry';
import { useOpenNoteCell } from './sheet-note-open-context';
import { SheetCellSlot } from './SheetCellSlot';

type Box = { x: number; y: number; w: number; h: number };

export function SheetCellNotes({ hover }: { hover: { r: number; c: number } | null }) {
  const c = useSheetController();
  const open = useOpenNoteCell();
  // A merged cell's note is its top-left cell's.
  const merge = hover ? mergeAt(c.geometry, hover.r, hover.c) : null;
  const at = merge ? { r: merge.r1, c: merge.c1 } : hover;
  const note =
    at && !c.editing
      ? readWorkbook(c.version, () => c.workbook.cellNoteOf(c.sheet.id, at.r, at.c))
      : null;
  if (!at || note === null) return null;
  if (open && open.sheetId === c.sheet.id && open.r === at.r && open.c === at.c) return null;
  const box = cellBox(c.geometry, at.r, at.c, c.scroll, merge);
  // Keyed by the cell, so moving to another noted cell waits the moment again.
  return <NoteCard key={`${at.r},${at.c}`} at={at} box={box} note={note} />;
}

function NoteCard({ at, box, note }: { at: { r: number; c: number }; box: Box; note: string }) {
  const shown = useDelayedReveal(NOTE_CARD_DELAY_MS);
  if (!shown) return null;
  return (
    <SheetCellSlot r={at.r} c={at.c}>
      <div
        role="tooltip"
        data-sheet-note-card=""
        className="pointer-events-none absolute z-[10] max-h-60 w-56 overflow-hidden rounded-menu border border-slate-200 bg-white px-3 py-2 text-supporting text-slate-800 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        style={{ left: box.x + box.w + 2, top: box.y }}
      >
        <p className="whitespace-pre-wrap break-words">{note}</p>
      </div>
    </SheetCellSlot>
  );
}

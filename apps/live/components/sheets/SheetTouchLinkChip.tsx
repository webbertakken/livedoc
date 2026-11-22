'use client';

// The link chip on a touch screen (docs/specs/029-sheets/formulas.md "Text", On a touch screen): a tap on a HYPERLINK
// selects it and shows its address under the cell with Open, the finger's way to it without Ctrl/⌘. Shown while the
// tapped cell is still the selection; its presses stay its own, so the grid under it is not tapped too.
import { useSheetController } from './sheet-controller';
import { SheetCellSlot } from './SheetCellSlot';
import { cellBox, mergeAt } from './sheet-geometry';
import type { TouchLinkCell } from './useSheetTouchLink';

export function SheetTouchLinkChip({
  tapped,
  onOpen,
}: {
  tapped: TouchLinkCell | null;
  onOpen: (link: string) => void;
}) {
  const c = useSheetController();
  const { selection } = c;
  // The tapped cell alone (or its merge) is still the selection.
  const cell = tapped
    ? (mergeAt(c.geometry, tapped.r, tapped.c) ?? {
        r1: tapped.r,
        c1: tapped.c,
        r2: tapped.r,
        c2: tapped.c,
      })
    : null;
  const [only, ...more] = selection.ranges;
  const still =
    tapped &&
    cell &&
    more.length === 0 &&
    selection.active.r === tapped.r &&
    selection.active.c === tapped.c &&
    only?.r1 === tapped.r &&
    only.c1 === tapped.c &&
    only.r2 <= cell.r2 &&
    only.c2 <= cell.c2;
  const link = still ? c.workbook.hyperlinkOf(c.sheet.id, tapped.r, tapped.c) : null;
  if (!still || !link) return null;
  const box = cellBox(c.geometry, tapped.r, tapped.c, c.scroll);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <SheetCellSlot r={tapped.r} c={tapped.c}>
      <div
        role="group"
        aria-label="Link"
        data-sheet-link-chip
        className="absolute z-[11] flex max-w-72 items-center gap-2 rounded-lg bg-slate-800 py-1 pl-3 pr-1 text-xs text-white shadow-lg"
        style={{
          left: c.geometry.headW + box.x,
          top: c.geometry.headH + box.y + box.h + 4,
        }}
        onPointerDown={stop}
        onClick={stop}
      >
        <span className="min-w-0 truncate">{link}</span>
        <button
          type="button"
          className="h-8 shrink-0 cursor-pointer rounded-md bg-white/10 px-3 font-medium hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
          onClick={() => onOpen(link)}
        >
          Open
        </button>
      </div>
    </SheetCellSlot>
  );
}

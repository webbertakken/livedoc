'use client';

// The Edit button of a pivot table (docs/specs/029-sheets/pivot-tables.md "Working with one"): shown while the active
// cell is in a pivot table's output or on its anchor, under the output's first column below its last row; it opens
// the Pivot Table Editor. An Editor's alone: nothing is drawn where no one may change pivot tables.
import { useSheetController } from '../sheet-controller';
import { rectOf } from '../SheetSelectionLayer';
import { useSheetPivotEdit } from './sheet-pivots';

const BUTTON_GAP = 4;

export function SheetPivotsLayer() {
  const c = useSheetController();
  const edit = useSheetPivotEdit();
  if (!edit || !c.canShape || !c.sheet.layout.objects?.some((x) => x.kind === 'pivot')) return null;
  const { r, c: col } = c.selection.active;
  const out = c.workbook.pivotOutputAt(c.sheet.id, r, col);
  if (!out) return null;
  const box = rectOf(c.geometry, out.rect, c.scroll);
  return (
    <div className="pointer-events-none absolute inset-0" data-sheet-pivots="">
      <button
        type="button"
        data-pivot-edit={out.id}
        aria-label="Edit pivot table"
        className="pointer-events-auto absolute flex h-7 cursor-pointer items-center gap-1 rounded-control border border-(--office-line) bg-(--office-menu) px-2 text-body text-(--office-ink) shadow-sm hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
        style={{ left: box.x, top: box.y + box.h + BUTTON_GAP }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={() => edit(out.id)}
      >
        <span aria-hidden>✎</span>
        Edit
      </button>
    </div>
  );
}

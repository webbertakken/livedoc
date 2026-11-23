'use client';

// Smart Fill's offer on the grid (docs/specs/029-sheets/grid-and-editing.md "Fill and move", D150): each offered text
// in grey and italic in its empty cell, and a card by the edited cell with Accept (Ctrl+Enter) and Dismiss (Escape).
import { Button } from '@livedoc/ui';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import { useSheetController } from './sheet-controller';
import { cellBox, mergeAt, type GridWindow } from './sheet-geometry';
import { SheetCellSlot } from './SheetCellSlot';
import { fontPx } from './SheetCells';
import type { SheetActions } from './useSheetActions';

// The card's width, and its gap from the edited cell.
const CARD_PX = 232;
const CARD_GAP_PX = 6;
// A cell's text inset, as the cells draw theirs.
const TEXT_INSET_PX = 4;

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function SheetSmartFillLayer({
  window: w,
  actions,
}: {
  window: GridWindow;
  actions: Pick<SheetActions, 'acceptSmartFill' | 'dismissSmartFill'>;
}) {
  const c = useSheetController();
  const offer = c.smartFill;
  if (!offer || !c.interactive) return null;
  const g = c.geometry;
  const col = offer.at.c;
  const n = offer.cells.length;
  const mac = currentOfficePlatform().platform === 'mac';
  const at = cellBox(g, offer.at.r, col, c.scroll, mergeAt(g, offer.at.r, col));
  // Right of the edited cell, or left of it when the grid has no room there.
  const right = at.x + at.w + CARD_GAP_PX;
  const left =
    c.view.width && right + CARD_PX > c.view.width - g.headW ? at.x - CARD_GAP_PX - CARD_PX : right;
  return (
    <>
      {offer.cells
        .filter(({ r }) => r >= w.r1 && r <= w.r2 && !g.hiddenRow(r))
        .map(({ r, text }) => {
          const box = cellBox(g, r, col, c.scroll, mergeAt(g, r, col));
          return (
            <div
              key={r}
              aria-hidden
              data-smart-fill-preview
              className="pointer-events-none absolute z-[3] overflow-hidden whitespace-nowrap italic leading-none"
              style={{
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                padding: `0 ${TEXT_INSET_PX}px`,
                display: 'flex',
                alignItems: 'center',
                fontSize: fontPx(undefined),
                color: c.palette.muted,
              }}
            >
              {text}
            </div>
          );
        })}
      <SheetCellSlot r={offer.at.r} c={col}>
        <div
          role="dialog"
          aria-label="Smart Fill"
          className="absolute z-[8] rounded-lg border px-3 py-2 text-[13px] shadow-lg"
          style={{
            left: Math.max(0, left),
            top: Math.max(0, at.y),
            width: CARD_PX,
            backgroundColor: c.palette.surface,
            borderColor: c.palette.border,
          }}
          onPointerDown={stop}
          onDoubleClick={stop}
        >
          <p className="font-semibold">Smart Fill</p>
          <p className="mt-0.5" style={{ color: c.palette.muted }}>
            Fill {n} cell{n === 1 ? '' : 's'} with the pattern
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="xs"
              aria-keyshortcuts="Escape"
              onClick={() => actions.dismissSmartFill()}
            >
              Dismiss
            </Button>
            <Button
              variant="primary"
              size="xs"
              aria-keyshortcuts={mac ? 'Meta+Enter' : 'Control+Enter'}
              onClick={() => actions.acceptSmartFill()}
            >
              Accept <span className="opacity-75">{mac ? '⌘↵' : 'Ctrl+Enter'}</span>
            </Button>
          </div>
        </div>
      </SheetCellSlot>
    </>
  );
}

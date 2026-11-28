'use client';

// Where a spreadsheet's thread card sits (docs/specs/029-sheets/review.md "In the grid"): to the right of its anchor,
// level with its top, as Google's; Escape anywhere in it lets it go, the grid taking the keys back.
import type { KeyboardEvent, ReactNode } from 'react';
import { OfficePopup } from '@/components/office/OfficePopup';
import { POPUP_GAP, type Box } from '@/lib/office/popup-place';

export function SheetThreadPopup({
  at,
  onExit,
  children,
}: {
  // The anchor's top and right edge on the screen.
  at: { top: number; right: number };
  onExit: () => void;
  children: ReactNode;
}) {
  // The popup opens below its anchor's bottom: a box whose bottom sits a gap above the anchor's top.
  const anchor: Box = { left: at.right + 2, top: at.top, bottom: at.top - POPUP_GAP };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    onExit();
  };
  return (
    <OfficePopup anchor={anchor}>
      {/* Escape from its fields reaches here once the field has done nothing with it. */}
      <div data-sheet-thread-card="" className="w-72" onKeyDown={onKeyDown}>
        {children}
      </div>
    </OfficePopup>
  );
}

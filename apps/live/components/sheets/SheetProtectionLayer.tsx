'use client';

// Protected ranges hatched over the cells (docs/specs/029-sheets/data-tools.md "Protected ranges"): each the viewer may
// not write freely (a warning one too), a protected sheet less its exceptions, in diagonal lines of the theme's muted
// text at 25%, under the selection. Only a hint: the room decides every write.
import { useContext } from 'react';
import { protectedBoxes } from '@livedoc/sheets';
import { useSheetController } from './sheet-controller';
import { rectOf } from './SheetSelectionLayer';
import { ShowProtectedContext } from './show-protected';

export function SheetProtectionLayer() {
  const c = useSheetController();
  const shown = useContext(ShowProtectedContext);
  if (!shown || !c.sheet.layout.protections) return null;
  const viewer = c.store.protection() ?? { owner: false, editor: c.canShape };
  const line = `color-mix(in srgb, ${c.palette.muted} 25%, transparent)`;
  return (
    <div aria-hidden data-sheet-protected="" className="pointer-events-none absolute inset-0">
      {protectedBoxes(c.sheet.layout, viewer).map((box) => {
        const r = rectOf(c.geometry, box, c.scroll);
        return (
          <span
            key={`${box.r1}:${box.c1}:${box.r2}:${box.c2}`}
            className="absolute"
            style={{
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              backgroundImage: `repeating-linear-gradient(135deg, ${line} 0 1px, transparent 1px 7px)`,
            }}
          />
        );
      })}
    </div>
  );
}

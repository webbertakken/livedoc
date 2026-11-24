'use client';

import type { ReactNode } from 'react';
import { atLeastInset, safeInset } from '@livedoc/ui';

// The handle's card (46px) and the line's gap (8px).
const LANDSCAPE_HANDLE_GUTTER = 'landscape-phone:pr-[3.375rem]';

// The top line's side groups (docs/specs/007-editor/toolbar-layout.md "The top line"): the brand group at the left, the
// actions group at the right, 12px from the canvas's edges (or clear of a notch). The centre toolbar (the Palette strip
// or Draw's dock) is drawn on its own layer and keeps clear of both (lib/top-line-clearance). Where the two side
// groups alone do not fit (a narrow phone) the actions group gives way and swipes sideways, the brand group whole.
export function TopLine({ brand, actions }: { brand: ReactNode; actions: ReactNode }) {
  return (
    <div
      data-top-line=""
      data-tool-line=""
      style={{
        top: `calc(0.75rem + ${safeInset('top')})`,
        left: atLeastInset('0.75rem', 'left'),
        right: atLeastInset('0.75rem', 'right'),
      }}
      // Held sideways, the bars handle has the top right corner (LandscapeBarsHandle): the actions group keeps left of it.
      className={`pointer-events-none absolute z-[var(--z-toolbar)] flex items-start justify-between gap-2 ${LANDSCAPE_HANDLE_GUTTER}`}
    >
      {brand}
      {actions}
    </div>
  );
}

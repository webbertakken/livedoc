'use client';

import type { ReactNode } from 'react';
import { Glyph, Tooltip, atLeastInset } from '@livedoc/ui';
import { TOOLBAR_CARD, TOOLBAR_CONTROL_REST } from './toolbar-surface';

// A phone held sideways (docs/specs/007-editor/live-app.md "A phone held sideways"): the actions group
// and the document group fold away there so the canvas has the room, and a handle at the canvas's top-right
// corner shows them again. Both are CSS-gated on the `landscape-phone:` variant, so no script watches
// the screen; on every other device the wrapper is `display: contents` and the handle is not drawn.

/** Wraps one group (the actions group, the document group). Folded, it hides on a phone held sideways, unless focus is
 *  inside it (a name being typed keeps its bar). `display: contents` otherwise, so the editor's column
 *  lays out exactly as it does without it. */
export function LandscapeBarFold({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <div
      data-landscape-bar={shown ? 'shown' : 'folded'}
      className={shown ? 'contents' : 'contents landscape-phone:not-focus-within:hidden'}
    >
      {children}
    </div>
  );
}

/** The room the handle takes from the strip's row on a phone held sideways: its card (a 32px button, the tool
 *  line's, D242; 4px of padding and a 1px border each side: 42px) and the row's 8px gap, so 50px (3.125rem). Set
 *  as `--landscape-handle-room` on the row, which adds it to its right gutter; the top line pads by it too. */
export const LANDSCAPE_HANDLE_ROOM = 'landscape-phone:[--landscape-handle-room:3.125rem]';

// What the handle folds: the actions group and the document group (docs/specs/007-editor/live-app.md "A phone held
// sideways").
export const SHOW_BARS_LABEL = 'Show Controls';
export const HIDE_BARS_LABEL = 'Hide Controls';

/** The bars handle: a chevron card at the canvas's top-right corner, drawn only on a phone held
 *  sideways. Placed in the editor's column right after the header, in a zero-height row, so it sits
 *  at the canvas's top edge whether the header shows or not. */
export function LandscapeBarsHandle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const label = shown ? HIDE_BARS_LABEL : SHOW_BARS_LABEL;
  return (
    // Above the canvas's toolbars (the strip's row spans the canvas's width), under its overlays.
    <div className="relative z-[var(--z-chrome)] hidden h-0 shrink-0 landscape-phone:block">
      <div
        data-landscape-bars-handle=""
        // Chrome, not canvas: the canvas's capture-phase gestures skip a press inside a floating panel.
        data-floating-panel=""
        // 12px in, and past a landscape notch; below the status bar while the header is folded.
        style={{
          right: atLeastInset('0.75rem', 'right'),
          top: shown ? '0.75rem' : atLeastInset('0.75rem', 'top'),
        }}
        className={`pointer-events-auto absolute ${TOOLBAR_CARD}`}
      >
        <Tooltip label={label}>
          <button
            type="button"
            aria-label={label}
            aria-expanded={shown}
            onClick={onToggle}
            className={`relative flex h-field w-field touch-target items-center justify-center rounded-control transition ${TOOLBAR_CONTROL_REST}`}
          >
            <Glyph size={18} units={20}>
              <path d={shown ? 'M6 12.5l4-4 4 4' : 'M6 8l4 4 4-4'} />
            </Glyph>
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

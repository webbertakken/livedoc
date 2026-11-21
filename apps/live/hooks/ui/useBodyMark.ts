'use client';

import { useLayoutEffect } from 'react';

// A `data-<name>` mark on the body while anything holding it is on, for a rule that reaches across the page
// (`body[data-mode-message-shown] [data-yields-to-mode]`). A mark is what such a rule keys on, never `body:has(…)`:
// a `:has()` over the whole page makes the browser search the page again on every change anywhere in it, a press
// and each frame of a drag included (docs/specs/008-canvas/canvas-performance.md "A rule across the page keys on a
// mark"). Set before the browser paints, so the page never shows a frame without it.
const holders = new Map<string, number>();

// A mode's message is on screen (an armed tool's Cancel, a modifier hint): a standing message steps aside
// (docs/specs/007-editor/start-diagramming.md "Bringing it back").
export const MODE_MESSAGE_SHOWN = 'mode-message-shown';
// The isometric scene is on the canvas: the floating chrome takes its own layer (globals.css).
export const ISO_SCENE_SHOWN = 'iso-scene-shown';

export function useBodyMark(name: string, on = true): void {
  useLayoutEffect(() => {
    if (!on) return;
    const attribute = `data-${name}`;
    const count = (holders.get(name) ?? 0) + 1;
    holders.set(name, count);
    if (count === 1) document.body.setAttribute(attribute, '');
    return () => {
      const left = (holders.get(name) ?? 1) - 1;
      if (left > 0) {
        holders.set(name, left);
        return;
      }
      holders.delete(name);
      document.body.removeAttribute(attribute);
    };
  }, [name, on]);
}

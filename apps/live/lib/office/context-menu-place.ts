// Where a context menu opens (docs/specs/004-interface-design/office-shell.md "Context menus"): at the point, or to its
// left or above it where it would cross the window's right or bottom edge, never past the top-left corner.

export type Point = { x: number; y: number };

// Kept clear of the window's edges, in px.
export const CONTEXT_MENU_MARGIN = 8;

export function contextMenuPlace(
  at: Point,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const room = (start: number, extent: number, limit: number) =>
    start + extent + CONTEXT_MENU_MARGIN <= limit ? start : start - extent;
  return {
    left: Math.max(CONTEXT_MENU_MARGIN, room(at.x, size.width, viewport.width)),
    top: Math.max(CONTEXT_MENU_MARGIN, room(at.y, size.height, viewport.height)),
  };
}

/**
 * How far a submenu opened beside its row moves up (docs/specs/004-interface-design/office-shell.md "Menu bar"): enough
 * to end the margin clear of the window's bottom edge, never so far its top passes the margin below the window's top.
 */
export function submenuLift(
  drawn: { top: number; bottom: number },
  viewportHeight: number,
): number {
  const over = drawn.bottom + CONTEXT_MENU_MARGIN - viewportHeight;
  return over > 0 ? Math.max(0, Math.min(over, drawn.top - CONTEXT_MENU_MARGIN)) : 0;
}

// Where a toolbar's popup opens (docs/specs/004-interface-design/office-shell.md "Toolbar", value fields): under its
// control, or above it when there is no room below, slid left to stay inside the window, never past its corner.
import { CONTEXT_MENU_MARGIN } from './context-menu-place';

/** The gap between a control and its popup, in px. */
export const POPUP_GAP = 4;

export type Box = { left: number; top: number; bottom: number };

export function popupPlace(
  anchor: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const below = anchor.bottom + POPUP_GAP;
  const fitsBelow = below + size.height + CONTEXT_MENU_MARGIN <= viewport.height;
  const above = anchor.top - POPUP_GAP - size.height;
  const top = fitsBelow || above < CONTEXT_MENU_MARGIN ? below : above;
  const left = Math.min(anchor.left, viewport.width - size.width - CONTEXT_MENU_MARGIN);
  return { left: Math.max(CONTEXT_MENU_MARGIN, left), top: Math.max(CONTEXT_MENU_MARGIN, top) };
}

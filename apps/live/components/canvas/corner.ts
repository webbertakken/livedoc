// The top right corner of an Event Storming board (docs/specs/021-event-storming/suggestions.md "The suggestions
// corner"): where the Ask pill, the suggestions count and the Review pill stand, and the surface every card that
// opens from it is drawn on.
import type { StripBox } from '@/components/chrome/PaletteTray';

/** Where the corner stands: against the right edge; its top is `cornerTopPx`'s. */
export const CORNER_PLACE = 'fixed right-3';
/** The corner's paper: the pill's and the cards' alike. */
export const CORNER_SURFACE =
  'z-[var(--z-overlay)] border border-slate-200 bg-white text-slate-900 shadow-lg shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:shadow-slate-950/40';

/** The corner's top, clear of the top line's groups. */
export const CORNER_TOP_PX = 64;
/** How far in from the right edge the corner's pills reach: a strip reaching into this band would sit under them. */
export const CORNER_BAND_PX = 220;
/** The room under the strip a palette tray takes (tucked behind the strip, its row and a gap). */
export const TRAY_ROOM_PX = 40;
const CORNER_RIGHT_PX = 12;

/** The corner's top: 64 px down, or below the toolbar strip and its tray's room where the strip reaches the corner. */
export function cornerTopPx(strip: StripBox | null, viewportWidth: number): number {
  if (!strip) return CORNER_TOP_PX;
  const bandLeft = viewportWidth - CORNER_RIGHT_PX - CORNER_BAND_PX;
  if (strip.left + strip.width <= bandLeft) return CORNER_TOP_PX;
  return Math.max(CORNER_TOP_PX, Math.round(strip.bottom + TRAY_ROOM_PX));
}

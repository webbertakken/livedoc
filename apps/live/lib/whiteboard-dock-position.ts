// Where the whiteboard dock sits (docs/specs/023-draw-mode/draw-mode.md "Where the dock sits"), read from and
// written to the synced preferences. Apart from the dock's shape slots (whiteboard-dock-prefs.ts), which carry the
// shape catalogue and the palette with it, so Settings and its search name the setting without them
// (docs/specs/016-platform/web-performance.md).
import type { UserPreferences } from './user-preferences';

// Where the dock sits: the bottom unless the user chose the top.
export const WHITEBOARD_DOCK_POSITIONS = ['top', 'bottom'] as const;
export type WhiteboardDockPosition = (typeof WHITEBOARD_DOCK_POSITIONS)[number];

export function readWhiteboardDockPosition(prefs: UserPreferences): WhiteboardDockPosition {
  return prefs.whiteboardDockPosition === 'top' ? 'top' : 'bottom';
}

export function withWhiteboardDockPosition(
  prefs: UserPreferences,
  position: WhiteboardDockPosition,
): UserPreferences {
  return { ...prefs, whiteboardDockPosition: position };
}

// Seating (docs/specs/009-elements/chair.md "Facing", "Desk and sofa"): the furniture an Avatar-mode
// character sits down in. The chair, the desk and the two-seater sofa are drawn here, as one table of
// parts both renderers paint (the editor's FurnitureView and the headless svg-render-faces), so a desk
// on the canvas and a desk in an export are the same desk, and each has a drawing per facing rather
// than one drawing turned. Pure: no React, no DOM, safe in a worker.
//
// All three share `chairFacing` (where the furniture's back is) and the walk hook's arrival rule;
// what differs is the drawing, the facing it is drawn at, and how many seats it has.

import { DEFAULT_CHAIR_FACING, type ChairFacing } from './collab-shapes';
import type { Rect } from './geometry-primitives';

export type SeatingKind = 'chair' | 'desk' | 'sofa' | 'meeting-table';

export function isSeatingShape(kind: string): kind is SeatingKind {
  return kind === 'chair' || kind === 'desk' || kind === 'sofa' || kind === 'meeting-table';
}

/** Whether a seating kind takes a facing: a chair, desk or sofa; a meeting table seats six all round and never
 *  turns (docs/specs/009-elements/office.md). */
export function turnsWithFacing(kind: string): kind is Exclude<SeatingKind, 'meeting-table'> {
  return isSeatingShape(kind) && kind !== 'meeting-table';
}

// Where a new one's back is. A chair and a sofa face the reader; a desk is placed with its desk at
// the top and its chair in front, so the sitter faces up, at the computer, with their back to you.
export const DEFAULT_SEATING_FACING: Record<SeatingKind, ChairFacing> = {
  chair: DEFAULT_CHAIR_FACING,
  sofa: 'n',
  desk: 's',
  // The meeting table reads the same from every side and does not turn.
  'meeting-table': 'n',
};

export function seatingFacing(el: { shape: SeatingKind; chairFacing?: ChairFacing }): ChairFacing {
  return el.chairFacing ?? DEFAULT_SEATING_FACING[el.shape];
}

// The turn, in clockwise degrees, from one facing to another.
const FACING_DEGREES: Record<ChairFacing, number> = { n: 0, e: 90, s: 180, w: 270 };

export function facingTurn(from: ChairFacing, to: ChairFacing): 0 | 90 | 180 | 270 {
  return ((FACING_DEGREES[to] - FACING_DEGREES[from] + 360) % 360) as 0 | 90 | 180 | 270;
}

// Whether a facing lays the furniture on its side relative to another (a quarter turn), which is
// when its box swaps width for height.
export function facingSwapsBox(from: ChairFacing, to: ChairFacing): boolean {
  const turn = facingTurn(from, to);
  return turn === 90 || turn === 270;
}

// How a part is painted, the same in both renderers:
//   shadow: the contact shadow (fixed slate, low opacity)
//   panel:  a top surface: the seat fill with the stroke round it (cushions, a desk top, a seat)
//   face:   a vertical face toward the room (a seat's front edge, a backrest's back): the panel, shaded
//   line:   an unfilled stroke (legs)
//   rail:   a faint stroke (a seam, a stand)
//   screen: the monitor's glass (the stroke colour, so it follows the theme)
//   glint:  a light reflection on the glass
//   floor:  a room's floor, in the element's fill, unstroked (docs/specs/009-elements/office.md)
// A panel or face may carry its own `fill`: what keeps its colour whatever the theme (a leaf, water, coffee).
export type FurniturePartRole =
  'shadow' | 'panel' | 'face' | 'line' | 'rail' | 'screen' | 'glint' | 'floor';

export type FurniturePart = (
  | { tag: 'rect'; role: FurniturePartRole; x: number; y: number; w: number; h: number; rx: number }
  | { tag: 'ellipse'; role: FurniturePartRole; cx: number; cy: number; rx: number; ry: number }
  | { tag: 'path'; role: FurniturePartRole; d: string }
) & { fill?: string };

// One drawing of a piece, from the room's camera (docs/specs/009-elements/chair.md "Facing").
export type FurnitureDrawing = {
  // The drawing grid.
  width: number;
  height: number;
  parts: readonly FurniturePart[];
  // Where a sitter's feet go, as fractions of the grid.
  seats: readonly { u: number; v: number }[];
  // The occupied ring, in grid units: under the seats.
  ring: { cx: number; cy: number; rx: number; ry: number };
  // Where the ring is painted among the parts: before `parts[ringUnder]`, so it lies on the seat and under
  // whatever stands nearer the camera (a backrest's back, the desk and its monitor, a sofa's arms). Left out,
  // over every part (a piece that never shows a ring: the meeting table and the office pieces).
  ringUnder?: number;
};

// A piece's three drawings: `front` with the sitter facing down the canvas ('n'), `back` facing up
// ('s'), `side` facing left ('e'); facing right ('w') is the side drawing mirrored. Nothing is ever
// rotated, so legs always stand under the piece and its shadow always falls below it.
export type FurnitureArt = {
  front: FurnitureDrawing;
  back: FurnitureDrawing;
  side: FurnitureDrawing;
};

type FurnitureViewName = keyof FurnitureArt;

/** Which drawing a facing shows, and whether it is the mirrored side. */
export function facingView(facing: ChairFacing): { view: FurnitureViewName; mirrored: boolean } {
  switch (facing) {
    case 's':
      return { view: 'back', mirrored: false };
    case 'e':
      return { view: 'side', mirrored: false };
    case 'w':
      return { view: 'side', mirrored: true };
    default:
      return { view: 'front', mirrored: false };
  }
}

// Stroke widths, in grid units.
export const FURNITURE_PANEL_STROKE = 2;
export const FURNITURE_LINE_STROKE = 2.5;
export const FURNITURE_RAIL_STROKE = 1.5;
export const FURNITURE_RAIL_OPACITY = 0.55;
export const FURNITURE_SHADOW = { fill: '#0f172a', opacity: 0.12 } as const;
export const FURNITURE_GLINT = { stroke: '#ffffff', opacity: 0.35 } as const;
// How much of the stroke colour shades a face toward the room, over the seat fill.
export const FURNITURE_FACE_SHADE = 0.22;

/**
 * The box a desk or sofa takes when turned from one facing to another: the same centre, its sides
 * swapped on a quarter turn so the drawing keeps its proportions. A chair is square enough to turn
 * in place.
 */
export function turnedSeatingBox(
  el: Rect & { shape: SeatingKind },
  from: ChairFacing,
  to: ChairFacing,
): Rect {
  if (el.shape === 'chair' || el.shape === 'meeting-table' || !facingSwapsBox(from, to))
    return { ...el };
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return { x: cx - el.height / 2, y: cy - el.width / 2, width: el.height, height: el.width };
}

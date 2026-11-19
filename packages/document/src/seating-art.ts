// Seating's drawings (docs/specs/009-elements/chair.md "Facing", "Desk and sofa"): the chair, the desk and the sofa as
// tables of parts per facing, which both renderers paint (the editor's FurnitureView and the headless
// svg-render-faces), and the seats each drawing puts a sitter on. Loaded with the office and seating family
// (docs/specs/016-platform/web-performance.md); what every board reads of seating is seating.ts's. Pure.

import type { ChairFacing, ChairSitterFacing } from './collab-shapes';
import type { Rect } from './geometry-primitives';
import { MEETING_TABLE_ART, MEETING_TABLE_VIEW } from './office-art';
import {
  facingView,
  seatingFacing,
  type FurnitureArt,
  type FurnitureDrawing,
  type FurniturePartRole,
  type SeatingKind,
} from './seating';

const rect = (role: FurniturePartRole, x: number, y: number, w: number, h: number, rx: number) =>
  ({ tag: 'rect', role, x, y, w, h, rx }) as const;
const ellipse = (role: FurniturePartRole, cx: number, cy: number, rx: number, ry: number) =>
  ({ tag: 'ellipse', role, cx, cy, rx, ry }) as const;
const path = (role: FurniturePartRole, d: string) => ({ tag: 'path', role, d }) as const;

// A chair. Square enough to turn in place, so all three drawings share one grid.
export const CHAIR_ART: FurnitureArt = {
  // Facing you: the seat, its front edge, and the backrest standing behind it.
  front: {
    width: 64,
    height: 72,
    parts: [
      ellipse('shadow', 32, 66, 20, 4),
      path('line', 'M15 47v16M49 47v16'),
      path('rail', 'M15 57h34'),
      rect('panel', 17, 3, 30, 31, 4),
      path('rail', 'M32 8v21'),
      rect('panel', 10, 33, 44, 12, 3),
      rect('face', 10, 43, 44, 5, 2.5),
    ],
    seats: [{ u: 0.5, v: 0.62 }],
    ring: { cx: 32, cy: 40, rx: 24, ry: 10 },
    ringUnder: 6,
  },
  // Its back to you: the seat beyond, and the backrest's back nearest you, over it.
  back: {
    width: 64,
    height: 72,
    parts: [
      ellipse('shadow', 32, 66, 20, 4),
      path('line', 'M15 44v19M49 44v19'),
      path('rail', 'M15 57h34'),
      rect('panel', 10, 20, 44, 13, 3),
      rect('face', 17, 12, 30, 34, 4),
      path('rail', 'M32 17v24'),
    ],
    seats: [{ u: 0.5, v: 0.38 }],
    ring: { cx: 32, cy: 27, rx: 24, ry: 9 },
    ringUnder: 4,
  },
  // Facing left: the seat from above with its front edge, the backrest a bar along its right.
  side: {
    width: 64,
    height: 72,
    parts: [
      ellipse('shadow', 30, 66, 20, 4),
      path('line', 'M13 47v16M45 47v16'),
      path('rail', 'M13 57h32'),
      rect('panel', 8, 32, 38, 12, 3),
      rect('face', 8, 42, 38, 5, 2.5),
      rect('panel', 42, 4, 9, 43, 3),
      rect('face', 42, 41, 9, 6, 2),
    ],
    seats: [{ u: 0.38, v: 0.5 }],
    ring: { cx: 26, cy: 38, rx: 20, ry: 9 },
    ringUnder: 4,
  },
};

// A desk with a computer on it and a chair pulled up to it. Whoever sits faces the computer.
export const DESK_ART: FurnitureArt = {
  // The sitter faces you: the chair beyond the desk, the desk nearest you, and the monitor's back on it
  // (low and narrow, so the sitter is seen over it).
  front: {
    width: 120,
    height: 112,
    parts: [
      ellipse('shadow', 60, 102, 54, 5),
      // The chair beyond the desk: its backrest, then its seat.
      rect('panel', 41, 2, 38, 24, 5),
      path('rail', 'M60 7v14'),
      rect('panel', 32, 22, 56, 12, 3),
      // The desk: legs, its top, and the front edge toward you.
      path('line', 'M12 74v24M108 74v24'),
      rect('panel', 4, 50, 112, 16, 3),
      rect('face', 4, 64, 112, 10, 2),
      // The monitor's back on the desk, on its stand.
      rect('panel', 52, 54, 16, 4, 1.5),
      path('rail', 'M60 50v5'),
      rect('face', 40, 32, 40, 19, 4),
      path('rail', 'M48 38h24M48 44h24'),
      // A mug at the corner.
      rect('panel', 98, 46, 8, 9, 2),
    ],
    seats: [{ u: 0.5, v: 0.26 }],
    ring: { cx: 60, cy: 28, rx: 28, ry: 8 },
    ringUnder: 4,
  },
  // Its back to you: the desk at the back, the monitor's screen toward you, the chair's back nearest.
  back: {
    width: 120,
    height: 112,
    parts: [
      ellipse('shadow', 60, 78, 54, 5),
      path('line', 'M12 52v26M108 52v26'),
      rect('panel', 4, 38, 112, 15, 3),
      path('rail', 'M60 33v6'),
      rect('panel', 50, 37, 20, 3, 1.5),
      rect('panel', 32, 4, 56, 32, 3),
      rect('screen', 36, 8, 48, 24, 1.5),
      path('glint', 'M41 27l10-14M47 27l7-10'),
      rect('rail', 38, 42, 34, 7, 1.5),
      ellipse('rail', 82, 45.5, 3.2, 4),
      ellipse('shadow', 60, 107, 24, 3.5),
      rect('panel', 32, 66, 56, 12, 3),
      path('line', 'M42 96v10M78 96v10'),
      rect('face', 41, 74, 38, 26, 5),
      path('rail', 'M60 79v16'),
    ],
    seats: [{ u: 0.5, v: 0.68 }],
    ring: { cx: 60, cy: 72, rx: 28, ry: 9 },
    ringUnder: 13,
  },
  // Facing left: the desk a long top down the left with its near end toward you, the monitor side-on
  // and its screen toward the chair, the chair on the right with its backrest along its right.
  side: {
    width: 112,
    height: 120,
    parts: [
      ellipse('shadow', 56, 113, 50, 5),
      path('line', 'M12 102v14M40 102v14'),
      rect('panel', 6, 18, 40, 76, 3),
      rect('face', 6, 92, 40, 10, 2),
      // The monitor, turned toward the chair but cheated a little toward you so its screen reads: its
      // foot behind it, its body, and the glass.
      rect('panel', 9, 50, 8, 16, 2),
      path('rail', 'M13 58h4'),
      rect('panel', 15, 32, 16, 48, 3),
      rect('screen', 19, 35, 9, 42, 1.5),
      path('glint', 'M21 50l5-8M21 57l5-8'),
      // The keyboard and mouse by the chair, and a mug.
      rect('rail', 34, 44, 8, 30, 2),
      ellipse('rail', 38, 82, 3, 3.5),
      rect('panel', 33, 22, 9, 9, 2),
      // The chair.
      path('line', 'M56 82v24M88 82v24'),
      rect('panel', 52, 48, 36, 28, 4),
      rect('face', 52, 74, 36, 7, 3),
      rect('panel', 85, 34, 10, 44, 3),
      rect('face', 85, 74, 10, 7, 2),
    ],
    seats: [{ u: 0.62, v: 0.52 }],
    ring: { cx: 70, cy: 62, rx: 24, ry: 14 },
    ringUnder: 14,
  },
};

// A two-seater sofa: a long back, two arms and two cushions, so two characters sit side by side.
export const SOFA_ART: FurnitureArt = {
  // Facing you: the back behind, the arms either end, the cushions and their front edge.
  front: {
    width: 136,
    height: 76,
    parts: [
      ellipse('shadow', 68, 70, 64, 4),
      path('line', 'M12 58v10M124 58v10'),
      rect('panel', 10, 4, 116, 32, 9),
      path('rail', 'M68 9v22'),
      rect('panel', 2, 24, 18, 36, 7),
      rect('panel', 116, 24, 18, 36, 7),
      rect('panel', 20, 33, 48, 16, 5),
      rect('panel', 68, 33, 48, 16, 5),
      rect('face', 20, 47, 96, 10, 4),
    ],
    seats: [
      { u: 44 / 136, v: 0.58 },
      { u: 92 / 136, v: 0.58 },
    ],
    ring: { cx: 68, cy: 44, rx: 56, ry: 12 },
    ringUnder: 8,
  },
  // Its back to you: the cushions beyond, the arms, and the back's broad back nearest you.
  back: {
    width: 136,
    height: 76,
    parts: [
      ellipse('shadow', 68, 70, 64, 4),
      path('line', 'M12 58v10M124 58v10'),
      rect('panel', 20, 12, 48, 16, 5),
      rect('panel', 68, 12, 48, 16, 5),
      rect('panel', 2, 10, 18, 46, 7),
      rect('panel', 116, 10, 18, 46, 7),
      rect('face', 10, 22, 116, 38, 9),
      path('rail', 'M68 27v28'),
    ],
    seats: [
      { u: 44 / 136, v: 0.27 },
      { u: 92 / 136, v: 0.27 },
    ],
    ring: { cx: 68, cy: 20, rx: 56, ry: 10 },
    ringUnder: 4,
  },
  // Facing left: tall, its two cushions one above the other, the back a long bar on the right, the
  // arms at either end, and its legs only under its lower end.
  side: {
    width: 76,
    height: 136,
    parts: [
      ellipse('shadow', 38, 131, 34, 4),
      path('line', 'M12 124v8M64 124v8'),
      rect('panel', 50, 6, 20, 114, 8),
      rect('panel', 14, 22, 38, 44, 5),
      rect('panel', 14, 66, 38, 44, 5),
      rect('panel', 6, 4, 64, 20, 7),
      rect('panel', 6, 106, 64, 16, 7),
      rect('face', 6, 118, 64, 7, 3),
    ],
    seats: [
      { u: 33 / 76, v: 44 / 136 },
      { u: 33 / 76, v: 88 / 136 },
    ],
    ring: { cx: 33, cy: 66, rx: 24, ry: 48 },
    ringUnder: 5,
  },
};

export const FURNITURE_ART: Record<SeatingKind, FurnitureArt> = {
  chair: CHAIR_ART,
  desk: DESK_ART,
  sofa: SOFA_ART,
  'meeting-table': MEETING_TABLE_ART,
};

/** The drawing a piece shows at a facing: its grid as a viewBox, and the mirror for facing right. */
export function furnitureFrame(
  art: FurnitureArt,
  facing: ChairFacing,
): { viewBox: string; transform: string; view: FurnitureDrawing } {
  const { view: name, mirrored } = facingView(facing);
  const view = art[name];
  return {
    viewBox: `0 0 ${view.width} ${view.height}`,
    transform: mirrored ? `translate(${view.width} 0) scale(-1 1)` : '',
    view,
  };
}

/**
 * Every seat's feet point, in canvas coordinates, from the drawing its facing shows. A meeting table's seats
 * also say which way their sitter faces (docs/specs/009-elements/office.md "Meeting Table").
 */
export function seatPoints(
  el: Rect & { shape: SeatingKind; chairFacing?: ChairFacing },
): { x: number; y: number; facing?: ChairSitterFacing }[] {
  if (el.shape === 'meeting-table') {
    const drawn = drawnRect(el, MEETING_TABLE_VIEW);
    return MEETING_TABLE_VIEW.tableSeats.map(({ u, v, facing }) => ({
      x: drawn.x + drawn.width * u,
      y: drawn.y + drawn.height * v,
      facing,
    }));
  }
  const { view: name, mirrored } = facingView(seatingFacing(el));
  const view = FURNITURE_ART[el.shape][name];
  const drawn = drawnRect(el, view);
  return view.seats.map(({ u, v }) => ({
    x: drawn.x + drawn.width * (mirrored ? 1 - u : u),
    y: drawn.y + drawn.height * v,
  }));
}

// Where the drawing actually lies in the box: both renderers fit its grid whole and centred (preserveAspectRatio
// meet), so a box of other proportions (a quarter turn written without swapping the box, an aspect unlocked and
// stretched) letterboxes it, and a seat measured on the whole box would miss the drawn cushion.
function drawnRect(box: Rect, view: { width: number; height: number }): Rect {
  const scale = Math.min(box.width / view.width, box.height / view.height);
  const width = view.width * scale;
  const height = view.height * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

/** The seat nearest a point (where the character walked in), so a sofa seats you on your side. */
export function nearestSeat(
  el: Rect & { shape: SeatingKind; chairFacing?: ChairFacing },
  from: { x: number; y: number },
): { x: number; y: number; facing?: ChairSitterFacing } {
  const seats = seatPoints(el);
  let best = seats[0]!;
  for (const seat of seats) {
    if (Math.hypot(seat.x - from.x, seat.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y))
      best = seat;
  }
  return best;
}

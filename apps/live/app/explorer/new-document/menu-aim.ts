// Menu aim (docs/specs/013-workspace/new-document-menu.md "The menu", D193): whether the pointer, moving from
// `previous` to `current`, heads for the pane. It does when `current` lies inside the triangle of `previous` and the
// pane's two near corners, so crossing other rows on the way does not change the selected blank. Pure.
export type Point = { x: number; y: number };

// The pane's near edge, as the two corners the pointer aims between.
export type AimTarget = { top: Point; bottom: Point };

// MENU_AIM_DELAY_MS: how long a heading pointer holds the selection after its last move.
export const MENU_AIM_DELAY_MS = 300;

const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export function isHeadingTowards(previous: Point, current: Point, target: AimTarget): boolean {
  if (previous.x === current.x && previous.y === current.y) return false;
  const d1 = cross(previous, target.top, current);
  const d2 = cross(target.top, target.bottom, current);
  const d3 = cross(target.bottom, previous, current);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

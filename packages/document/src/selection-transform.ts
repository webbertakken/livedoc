// Turning and flipping a selection as one rigid piece (docs/specs/008-canvas/selection-transforms.md). Pure: each
// takes the tab's elements and the selected ids and returns the elements with the selection's unlocked members
// transformed about the selection's pivot, or the same list when nothing changes.
import type { Anchor, ArrowElement, Endpoint } from './arrow-types';
import { reflectElement, type ReflectionAxis } from './element-mirror';
import { boundsOfPoints, rotatePoint, unionRects, type Point } from './geometry-primitives';
import { isBoxed, type BoxedElement, type Element } from './index';
import { isSheetAnchoredChart } from './chart-source';
import { eventStormingKindOf } from './event-storming';
import { isPointerNote, pointerTipOf, withPointerTip } from './pointer-note';
import { drawnBounds, rotationOf, supportsRotation } from './rotation';

/** Flip Horizontal mirrors left to right, Flip Vertical top to bottom. */
export type FlipDirection = 'horizontal' | 'vertical';

type Vector = { dx: number; dy: number };

const isMember = (el: Element, ids: ReadonlySet<string>) => ids.has(el.id) && el.locked !== true;

const freeEnds = (arrow: ArrowElement): Point[] =>
  [arrow.from, arrow.to].flatMap((end) => (end.kind === 'free' ? [{ x: end.x, y: end.y }] : []));

/** The centre of the selection's frame: its unlocked boxed members as drawn, else its arrows' free ends. */
export function selectionPivot(
  elements: readonly Element[],
  ids: ReadonlySet<string>,
): Point | null {
  const members = elements.filter((el) => isMember(el, ids));
  const frame =
    unionRects(members.filter(isBoxed).map(drawnBounds)) ??
    boundsOfPoints(members.flatMap((el) => (el.type === 'arrow' ? freeEnds(el) : [])));
  return frame ? { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 } : null;
}

/**
 * Whether one element turns by hand and offers its Rotation tiles: it rotates, and is neither an event-storming note
 * (its tilt is notation) nor a chart its Sheet draws square on the cells.
 */
export function turnsByHand(el: Element): boolean {
  return supportsRotation(el) && eventStormingKindOf(el) === null && !isSheetAnchoredChart(el);
}

/** The member a selection's angle is read from: the first unlocked one, in document order, that can rotate. */
export function turnReference(
  elements: readonly Element[],
  ids: ReadonlySet<string>,
): BoxedElement | null {
  return (
    elements.find((el): el is BoxedElement => isMember(el, ids) && supportsRotation(el)) ?? null
  );
}

const normalisedDegrees = (deg: number) => ((deg % 360) + 360) % 360;

/** The element with its angle set, upright stored as absent. */
function withRotation<T extends BoxedElement>(el: T, deg: number): T {
  const { rotation: _old, ...rest } = el as T & { rotation?: number };
  const next = normalisedDegrees(deg);
  return (next === 0 ? rest : { ...rest, rotation: next }) as T;
}

const turnVector = (v: Vector, deg: number): Vector => {
  const p = rotatePoint({ x: v.dx, y: v.dy }, { x: 0, y: 0 }, deg);
  return { dx: p.x, dy: p.y };
};

function turnBoxed(el: BoxedElement, pivot: Point, deg: number): BoxedElement {
  const centre = rotatePoint({ x: el.x + el.width / 2, y: el.y + el.height / 2 }, pivot, deg);
  const moved = { ...el, x: centre.x - el.width / 2, y: centre.y - el.height / 2 };
  if (supportsRotation(moved)) return withRotation(moved, rotationOf(el) + deg);
  if (isPointerNote(moved)) {
    const half = { x: el.width / 2, y: el.height / 2 };
    const tip = rotatePoint(pointerTipOf(moved), half, deg);
    return withPointerTip(moved, tip);
  }
  return moved;
}

function turnArrow(arrow: ArrowElement, pivot: Point, deg: number): ArrowElement {
  const end = (e: Endpoint): Endpoint =>
    e.kind === 'free' ? { kind: 'free', ...rotatePoint({ x: e.x, y: e.y }, pivot, deg) } : e;
  return {
    ...arrow,
    from: end(arrow.from),
    to: end(arrow.to),
    ...(arrow.curveOffset ? { curveOffset: turnVector(arrow.curveOffset, deg) } : {}),
    ...(arrow.curvePoints ? { curvePoints: arrow.curvePoints.map((v) => turnVector(v, deg)) } : {}),
    ...(arrow.elbowOffset ? { elbowOffset: turnVector(arrow.elbowOffset, deg) } : {}),
  };
}

/**
 * The selection turned clockwise by `degrees` (rounded to whole degrees) about `pivot` (its own by default): each
 * member orbits the pivot, a member that can rotate adds the turn to its angle, the rest stay upright.
 */
export function turnSelection(
  elements: Element[],
  ids: ReadonlySet<string>,
  degrees: number,
  pivot: Point | null = selectionPivot(elements, ids),
): Element[] {
  const turn = Math.round(degrees);
  if (turn % 360 === 0 || !pivot) return elements;
  return elements.map((el) => {
    if (!isMember(el, ids)) return el;
    return el.type === 'arrow' ? turnArrow(el, pivot, turn) : turnBoxed(el, pivot, turn);
  });
}

/** The selection turned so its reference member lands on `degrees`, the rest keeping their places relative to it. */
export function turnSelectionTo(
  elements: Element[],
  ids: ReadonlySet<string>,
  degrees: number,
): Element[] {
  const reference = turnReference(elements, ids);
  if (!reference) return elements;
  return turnSelection(elements, ids, Math.round(degrees) - rotationOf(reference));
}

const SWAPS: Record<FlipDirection, Record<string, string>> = {
  horizontal: { e: 'w', w: 'e' },
  vertical: { n: 's', s: 'n' },
};

/** The anchor on the other side of a flipped element: east and west swap horizontally, north and south vertically. */
export function mirroredAnchor(anchor: Anchor, direction: FlipDirection): Anchor {
  const swap = SWAPS[direction];
  return [...anchor].map((c) => swap[c] ?? c).join('') as Anchor;
}

// Flip Horizontal reflects across a vertical line, Flip Vertical across a horizontal one.
const AXIS: Record<FlipDirection, ReflectionAxis> = {
  horizontal: 'vertical',
  vertical: 'horizontal',
};

function flipBoxed(el: BoxedElement, direction: FlipDirection, pivot: Point): BoxedElement {
  const at = direction === 'horizontal' ? pivot.x : pivot.y;
  const reflected = reflectElement(el, AXIS[direction], at);
  const turned = supportsRotation(reflected)
    ? withRotation(reflected, rotationOf(reflected))
    : reflected;
  if (!isPointerNote(turned)) return turned;
  const tip = pointerTipOf(turned);
  return withPointerTip(
    turned,
    direction === 'horizontal'
      ? { x: el.width - tip.x, y: tip.y }
      : { x: tip.x, y: el.height - tip.y },
  );
}

function flipArrow(
  arrow: ArrowElement,
  direction: FlipDirection,
  pivot: Point,
  selected: boolean,
  flippedIds: ReadonlySet<string>,
): ArrowElement {
  const point = (p: Point): Point =>
    direction === 'horizontal'
      ? { x: 2 * pivot.x - p.x, y: p.y }
      : { x: p.x, y: 2 * pivot.y - p.y };
  const vector = (v: Vector): Vector =>
    direction === 'horizontal' ? { dx: -v.dx, dy: v.dy } : { dx: v.dx, dy: -v.dy };
  const end = (e: Endpoint): Endpoint => {
    if (e.kind === 'pinned' && flippedIds.has(e.elementId)) {
      return { ...e, anchor: mirroredAnchor(e.anchor, direction) };
    }
    return selected && e.kind === 'free' ? { kind: 'free', ...point(e) } : e;
  };
  const from = end(arrow.from);
  const to = end(arrow.to);
  if (!selected) return from === arrow.from && to === arrow.to ? arrow : { ...arrow, from, to };
  return {
    ...arrow,
    from,
    to,
    ...(arrow.curveOffset ? { curveOffset: vector(arrow.curveOffset) } : {}),
    ...(arrow.curvePoints ? { curvePoints: arrow.curvePoints.map(vector) } : {}),
    ...(arrow.elbowOffset ? { elbowOffset: vector(arrow.elbowOffset) } : {}),
    ...(arrow.labelOffset
      ? { labelOffset: { ...arrow.labelOffset, offset: -arrow.labelOffset.offset } }
      : {}),
  };
}

/**
 * The selection mirrored across the line through `pivot` (its own by default): boxes reflected and angles negated,
 * strokes' and paths' ink reflected, every other face kept readable; an end pinned to a flipped member moves to the
 * mirrored anchor.
 */
export function flipSelection(
  elements: Element[],
  ids: ReadonlySet<string>,
  direction: FlipDirection,
  pivot: Point | null = selectionPivot(elements, ids),
): Element[] {
  if (!pivot) return elements;
  const flippedIds = new Set(
    elements.filter((el) => isMember(el, ids) && isBoxed(el)).map((el) => el.id),
  );
  return elements.map((el) => {
    if (flippedIds.has(el.id)) return flipBoxed(el as BoxedElement, direction, pivot);
    if (el.type === 'arrow') return flipArrow(el, direction, pivot, isMember(el, ids), flippedIds);
    return el;
  });
}

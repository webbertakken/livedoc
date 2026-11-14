// Fan-out for converging arrow endpoints. When several arrows pin to the
// SAME anchor of the same element (a hub node with four children all
// pointing at its 's' anchor), every head resolves to the identical point
// and the arrowheads pile into an unreadable blur. This helper hands each
// such end a small tangential offset ALONG the target edge so the heads
// land side by side. Purely visual: the stored endpoints are untouched, so
// rebinding, snapping, and hit-testing still reason about the true anchor.
//
// Consumed by both render paths (the live canvas's arrow-view-frame and
// the SVG export's svgArrow), which is why it lives here rather than in
// the app.

import {
  isBoxed,
  type Anchor,
  type ArrowElement,
  type Element,
  type ElementId,
  type Endpoint,
} from './index';
import { anchorClass, anchorPrimarySide } from './anchors';
import { endpointPosition, isElementIndex, type ElementIndex, type Point } from './geometry';
import { connectorBox } from './shape-outline';

// Gap between adjacent fanned heads, in canvas px. Clamped down when the
// fan would otherwise occupy more than SPREAD_EDGE_FRACTION of the target
// edge (many arrows into a small box).
const SPREAD_SPACING = 14;
const SPREAD_EDGE_FRACTION = 0.8;
// A quarter's fan is centred on it and must stay between its corner and its
// edge's middle, so its room is half the edge
// (docs/specs/008-canvas/arrow-anchors.md).
const QUARTER_FAN_ROOM = 0.5;

// Which axis a fan runs along, per anchor: ends on the top / bottom edges
// slide horizontally, ends on the left / right edges vertically. Corner
// anchors belong to their horizontal edge (their primary side).
function spreadAxis(anchor: Anchor): 'x' | 'y' {
  const side = anchorPrimarySide(anchor);
  return side === 'e' || side === 'w' ? 'y' : 'x';
}

// Corner fans can't be centred on the anchor (half the heads would float
// off the box), so they march INWARD along the edge instead. Returns the
// inward sign for a corner anchor, or null for a face anchor (centred).
function cornerInwardSign(anchor: Anchor): 1 | -1 | null {
  switch (anchor) {
    case 'ne':
    case 'se':
      return -1;
    case 'nw':
    case 'sw':
      return 1;
    default:
      return null;
  }
}

type ConvergingEnd = {
  arrowId: ElementId;
  end: 'from' | 'to';
  // Where the arrow's OTHER endpoint sits, so the fan can order the slots
  // to match the incoming directions and the lines don't cross.
  other: Point;
};

// One end pinned to an anchor, before any position is resolved.
type ConvergingPin = { arrow: ArrowElement; end: 'from' | 'to' };

function pinKey(endpoint: Endpoint): string | null {
  if (endpoint.kind === 'pinned') return `el:${endpoint.elementId}:${endpoint.anchor}`;
  return null;
}

// The edge length available to a fan, and the target's rotation (a rotated
// element rotates its edges, so the offsets must rotate with them).
function fanFrame(
  endpoint: Endpoint,
  index: ElementIndex,
): { span: number; rotation: number; anchor: Anchor } | null {
  if (endpoint.kind === 'pinned') {
    const target = index.get(endpoint.elementId);
    if (!target || !isBoxed(target)) return null;
    const box = connectorBox(target);
    const edge = spreadAxis(endpoint.anchor) === 'x' ? box.width : box.height;
    return {
      span: anchorClass(endpoint.anchor) === 'quarter' ? edge * QUARTER_FAN_ROOM : edge,
      rotation: target.rotation ?? 0,
      anchor: endpoint.anchor,
    };
  }
  return null;
}

// Which ends converge on each pinned anchor, by key, for one element set: a scan of the arrows alone,
// resolving no position. An end set exactly at its anchor (exactStart, exactEnd) sits out of that
// anchor's fan.
function convergingPins(elements: Iterable<Element>): Map<string, ConvergingPin[]> {
  const pins = new Map<string, ConvergingPin[]>();
  for (const el of elements) {
    if (el.type !== 'arrow') continue;
    for (const end of ['from', 'to'] as const) {
      if (end === 'from' && el.exactStart === true) continue;
      if (end === 'to' && el.exactEnd === true) continue;
      const key = pinKey(el[end]);
      if (!key) continue;
      const list = pins.get(key);
      if (list) list.push({ arrow: el, end });
      else pins.set(key, [{ arrow: el, end }]);
    }
  }
  return pins;
}

// One fan's offsets, keyed `${arrowId}:${end}`; empty when fewer than two ends converge or the
// target is gone.
function fanOffsets(pins: readonly ConvergingPin[], index: ElementIndex): Map<string, Point> {
  const offsets = new Map<string, Point>();
  if (pins.length < 2) return offsets;
  const first = pins[0]!;
  const frame = fanFrame(first.arrow[first.end], index);
  if (!frame) return offsets;
  const at = endpointPosition(first.arrow[first.end], index);
  const ends: ConvergingEnd[] = pins.map(({ arrow, end }) => ({
    arrowId: arrow.id,
    end,
    other: endpointPosition(end === 'from' ? arrow.to : arrow.from, index),
  }));
  const axis = spreadAxis(frame.anchor);
  const n = ends.length;
  const spacing = Math.min(SPREAD_SPACING, (frame.span * SPREAD_EDGE_FRACTION) / (n - 1));
  // Slot positions along the edge: centred on the anchor for a face,
  // marching inward from a corner.
  const inward = cornerInwardSign(frame.anchor);
  // `|| 0` normalises the -0 that `inward * spacing * 0` produces.
  const slots = Array.from({ length: n }, (_, i) =>
    inward === null ? (i - (n - 1) / 2) * spacing || 0 : inward * spacing * i || 0,
  ).sort((a, b) => a - b);
  // Match ascending slots to ends sorted by where they come FROM along
  // the same axis, so neighbouring arrows don't cross at the fan.
  // Ends coming from one place along the edge (two steps in one column) tie on that: the nearer takes the slot on
  // the side they come from, so its run stops short of the farther one's instead of crossing it.
  const along = (q: Point) => (axis === 'x' ? q.x : q.y);
  const across = (q: Point) => (axis === 'x' ? q.y : q.x);
  const nearness = (e: ConvergingEnd) =>
    Math.abs(across(e.other) - across(at)) * Math.sign(along(at) - along(e.other));
  // Whole pixels, so "level" is a consistent bucket: ties within a pixel either way (0, 0.8, 1.6) are not transitive,
  // and a sort given an inconsistent comparator ordered the fan by the arrows' order on the tab.
  const sorted = [...ends].sort(
    (a, b) =>
      Math.round(along(a.other)) - Math.round(along(b.other)) ||
      nearness(a) - nearness(b) ||
      (a.arrowId < b.arrowId ? -1 : 1),
  );
  const rad = (frame.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  sorted.forEach((e, i) => {
    const t = slots[i] ?? 0;
    const local = axis === 'x' ? { x: t, y: 0 } : { x: 0, y: t };
    // Rotate the tangential offset with the target so the fan stays on
    // the (rotated) edge.
    offsets.set(`${e.arrowId}:${e.end}`, {
      x: local.x * cos - local.y * sin,
      y: local.x * sin + local.y * cos,
    });
  });
  return offsets;
}

// Per element set, the fans asked about so far: the pins are scanned once (no position resolved),
// and each fan's offsets worked out when one of its ends is first asked for. Keyed on the
// collection's identity; tab state is immutable, so a changed tab is a new array / index. A drag
// preview, which asks over a fresh index every frame for the arrows it redraws, so resolves only
// their fans (docs/specs/008-canvas/canvas-performance.md "Whole-board passes stay linear and run once").
type SpreadState = {
  index: ElementIndex;
  pins: Map<string, ConvergingPin[]>;
  fans: Map<string, Map<string, Point>>;
};
const spreadCache = new WeakMap<object, SpreadState>();

function spreadStateFor(elements: Element[] | ElementIndex): SpreadState {
  const cached = spreadCache.get(elements);
  if (cached) return cached;
  const index = isElementIndex(elements)
    ? elements
    : new Map(elements.map((el) => [el.id, el] as const));
  const state = {
    index,
    pins: convergingPins(isElementIndex(elements) ? elements.values() : elements),
    fans: new Map(),
  };
  spreadCache.set(elements, state);
  return state;
}

// The visual offset for one arrow end: {0,0} unless this end converges on
// a shared pin with at least one other arrow end.
export function arrowEndpointSpread(
  arrowId: ElementId,
  end: 'from' | 'to',
  elements: Element[] | ElementIndex,
): Point {
  const state = spreadStateFor(elements);
  const arrow = state.index.get(arrowId);
  const key = arrow?.type === 'arrow' ? pinKey(arrow[end]) : null;
  if (!key) return { x: 0, y: 0 };
  let fan = state.fans.get(key);
  if (!fan) {
    fan = fanOffsets(state.pins.get(key) ?? [], state.index);
    state.fans.set(key, fan);
  }
  return fan.get(`${arrowId}:${end}`) ?? { x: 0, y: 0 };
}

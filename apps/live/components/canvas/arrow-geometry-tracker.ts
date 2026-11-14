// Every arrow's frame and route-behind holes for the element layer, worked out again on a change of the board only
// where the change can have moved them (docs/specs/008-canvas/canvas-performance.md "A release re-renders what moved,
// too"): the arrows a drag preview would redraw for it (affectedArrows), the other arrows in their fans (a moved end
// can reorder a fan), and what rides on any of them. A change of finish or of paint order, or one touching a mind
// node (a map's connectors read their siblings and the root's flow), draws every arrow again.

import {
  isMindNode,
  resolveFinish,
  type ArrowElement,
  type Element,
  type ElementGrid,
  type ElementIndex,
  type Rect,
} from '@livedoc/document';
import { overlayBetween, type DragOverlay } from '@/lib/drag-preview';
import { arrowViewGeometry, type ArrowViewFrame } from './arrow-view-frame';
import { affectedArrows, type ArrowLinks } from './drag-affected-arrows';

export type ArrowGeometry = { frame: ArrowViewFrame; holes: Rect[] };

export type ArrowGeometryInputs = {
  elements: readonly Element[];
  index: ElementIndex;
  grid: ElementGrid;
  links: ArrowLinks;
  tabFinish: unknown;
};

// Whether the elements both boards hold sit in the same order.
function sameOrder(prev: readonly Element[], next: readonly Element[], overlay: DragOverlay) {
  const added = new Set(overlay.added.map((a) => a.el.id));
  let i = 0;
  for (const el of next) {
    if (added.has(el.id)) continue;
    while (i < prev.length && overlay.removed.has(prev[i]!.id)) i++;
    if (prev[i]?.id !== el.id) return false;
    i++;
  }
  return true;
}

// The arrows to work out again, or null for all of them.
function touched(
  prev: readonly Element[],
  next: readonly Element[],
  links: ArrowLinks,
): Set<string> | null {
  const overlay = overlayBetween('', next, prev);
  if (!sameOrder(prev, next, overlay)) return null;
  const before = new Map(prev.map((el) => [el.id, el] as const));
  const mind = (el: Element | undefined) => !!el && isMindNode(el);
  for (const [id, el] of overlay.changed) if (mind(el) || mind(before.get(id))) return null;
  for (const { el } of overlay.added) if (mind(el)) return null;
  for (const id of overlay.removed) if (mind(before.get(id))) return null;
  // An added element is a change from nothing: a box landing on an arrow cuts it.
  const changed = new Map(overlay.changed);
  for (const { el } of overlay.added) changed.set(el.id, el);
  const ids = affectedArrows({ ...overlay, changed, added: [] }, prev, links);
  // The fans every touched arrow sits in, or sat in (a removed or re-pinned end leaves its fan).
  const nextIndex = new Map(next.map((el) => [el.id, el] as const));
  const fans = new Set<string>();
  const fansOf = (el: Element | undefined) => {
    if (el?.type !== 'arrow') return;
    for (const end of [el.from, el.to])
      if (end.kind === 'pinned') fans.add(`${end.elementId}:${end.anchor}`);
  };
  for (const id of ids) {
    fansOf(nextIndex.get(id));
    fansOf(before.get(id));
  }
  for (const id of overlay.removed) fansOf(before.get(id));
  // Their other arrows, and what rides on them.
  const queue = [...ids];
  const add = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    queue.push(id);
  };
  for (const fan of fans) {
    const elementId = fan.slice(0, fan.lastIndexOf(':'));
    for (const dep of links.dependants.get(elementId) ?? []) {
      const arrow = nextIndex.get(dep) as ArrowElement | undefined;
      const inFan = [arrow?.from, arrow?.to].some(
        (end) => end?.kind === 'pinned' && `${end.elementId}:${end.anchor}` === fan,
      );
      if (inFan) add(dep);
    }
  }
  while (queue.length) for (const dep of links.dependants.get(queue.shift()!) ?? []) add(dep);
  return ids;
}

export function createArrowGeometryTracker(): {
  geometryFor: (inputs: ArrowGeometryInputs) => ReadonlyMap<string, ArrowGeometry>;
} {
  let last: {
    elements: readonly Element[];
    tabFinish: unknown;
    geometry: ReadonlyMap<string, ArrowGeometry>;
  } | null = null;
  return {
    geometryFor({ elements, index, grid, links, tabFinish }) {
      if (last?.elements === elements && last.tabFinish === tabFinish) return last.geometry;
      const draw = (arrow: ArrowElement) =>
        arrowViewGeometry(arrow, index, grid, resolveFinish(arrow.finish, tabFinish));
      const ids =
        last && last.tabFinish === tabFinish ? touched(last.elements, elements, links) : null;
      const geometry = new Map<string, ArrowGeometry>();
      for (const el of elements) {
        if (el.type !== 'arrow') continue;
        const kept = ids && !ids.has(el.id) ? last!.geometry.get(el.id) : undefined;
        geometry.set(el.id, kept ?? draw(el));
      }
      last = { elements, tabFinish, geometry };
      return geometry;
    },
  };
}

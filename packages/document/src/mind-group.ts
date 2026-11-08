// A mind map group (docs/specs/009-elements/mind-node.md "Groups"): a frame, titled at its top left, around siblings
// and their branches. The frame is the group: it is what is selected, dragged, titled and deleted. It marks itself as a
// group by carrying its own id as its `mindGroup`; its members carry that id too. Its box always follows its members,
// settled on every change (`settleMindGroups`), so it is never resized by hand. Pure.

import { createShape } from './factories';
import { isMindNode } from './mind-map';
import { mindGroupBoxes, mindGroupColours } from './mind-layout';
import type { Element, ElementId, ShapeElement } from './index';

/** Whether `el` is a group's frame. */
export function isMindGroupFrame(el: Element): boolean {
  return el.type === 'shape' && el.shape === 'frame' && el.mindGroup === el.id;
}

/** The mind nodes in the group `groupId`, in document order. */
export function mindGroupMembers(elements: readonly Element[], groupId: ElementId): ShapeElement[] {
  return elements.filter(
    (el): el is ShapeElement => isMindNode(el) && el.mindGroup === groupId && el.id !== groupId,
  );
}

/** A new group's frame, untitled and tinted, its box settled later around its members. */
export function newMindGroupFrame(id: ElementId): ShapeElement {
  const { fill, stroke } = mindGroupColours(id);
  return {
    ...createShape('frame', 0, 0),
    id,
    mindGroup: id,
    // Its size follows its members, so it offers no handles to resize it by.
    fixedSize: true,
    label: '',
    textAlignX: 'left',
    textAlignY: 'top',
    padding: 'sm',
    textSize: 14,
    textBold: true,
    fillColor: fill,
    strokeColor: stroke,
    strokeWidth: 'thin',
  };
}

/**
 * Every group made whole after a change: a frame takes its members' box, a frame left with no member goes, and a node
 * naming a group that has no frame leaves it. The same array when nothing changes.
 */
export function settleMindGroups(elements: Element[]): Element[] {
  if (!elements.some((el) => el.type === 'shape' && el.mindGroup)) return elements;
  const frames = new Set(elements.filter(isMindGroupFrame).map((f) => f.id));
  const boxes = new Map(mindGroupBoxes(elements).map((b) => [b.groupId, b]));
  let changed = false;
  const out: Element[] = [];
  for (const el of elements) {
    if (isMindGroupFrame(el) && el.type === 'shape') {
      const box = boxes.get(el.id);
      if (!box) {
        changed = true;
        continue;
      }
      const same =
        el.x === box.x && el.y === box.y && el.width === box.width && el.height === box.height;
      if (!same) changed = true;
      out.push(same ? el : { ...el, x: box.x, y: box.y, width: box.width, height: box.height });
      continue;
    }
    if (isMindNode(el) && el.mindGroup && !frames.has(el.mindGroup)) {
      const { mindGroup: _gone, ...rest } = el;
      out.push(rest);
      changed = true;
      continue;
    }
    out.push(el);
  }
  return changed ? out : elements;
}

/** `ids` with the members of every group frame among them. */
export function withMindGroupMembers(
  elements: readonly Element[],
  ids: ReadonlySet<ElementId>,
): Set<ElementId> {
  const out = new Set(ids);
  for (const el of elements)
    if (isMindNode(el) && el.mindGroup && ids.has(el.mindGroup)) out.add(el.id);
  return out;
}

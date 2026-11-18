// Pointing at a record box's parts (docs/specs/009-elements/entity.md "Editing on the canvas", "Field to field"):
// which part a point is over, and the field row a dragged arrow end pins to. Editing only, so it loads with the
// entities family (docs/specs/016-platform/web-performance.md), apart from the geometry every board reads.

import {
  ENTITY_BODY_PAD_PX,
  ENTITY_ROW_GAP_PX,
  ENTITY_ROW_PITCH_PX,
  entityFieldPoint,
  entityHeaderHeight,
  entityRowShows,
  type EntityBox,
} from './entity-geometry';
import { rotatePoint } from './geometry-primitives';
import type { TextSize } from './index';

// What part of an entity a canvas point is over, the box unrotated: its title bar, one of its field rows,
// the empty body below the last row, or outside it (null). Each row's band takes half the gap on either
// side, so the rows tile the list with no dead lines between them.
export type EntityPart = { kind: 'title' } | { kind: 'field'; index: number } | { kind: 'below' };

export function entityPartAt(
  el: EntityBox,
  fieldCount: number,
  point: { x: number; y: number },
): EntityPart | null {
  if (point.x < el.x || point.x > el.x + el.width) return null;
  if (point.y < el.y || point.y > el.y + el.height) return null;
  const header = el.y + entityHeaderHeight(el.textSize);
  if (point.y < header) return { kind: 'title' };
  const index = Math.floor(
    (point.y - header - ENTITY_BODY_PAD_PX + ENTITY_ROW_GAP_PX / 2) / ENTITY_ROW_PITCH_PX,
  );
  if (index < 0) return fieldCount > 0 ? { kind: 'field', index: 0 } : { kind: 'below' };
  if (index < fieldCount && entityRowShows(el, index)) return { kind: 'field', index };
  return { kind: 'below' };
}

// The field row an arrow end being dragged pins to (docs/specs/009-elements/entity.md "Field to field"):
// the topmost entity whose field row is under `cursor`, on the side facing `toward` (the arrow's other
// end), with the point the end then meets. `skipId` is the entity holding the other end: a field end on
// the entity it starts from is not offered. Null when no field row is under the cursor.
export function snapToEntityField(
  cursor: { x: number; y: number },
  elements: readonly {
    id: string;
    type: string;
    shape?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    textSize?: TextSize;
    entityFields?: readonly unknown[];
  }[],
  toward: { x: number; y: number },
  skipId: string | null,
): { elementId: string; anchor: 'w' | 'e'; field: number; point: { x: number; y: number } } | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    if (el.type !== 'shape' || el.shape !== 'entity' || el.id === skipId) continue;
    const box = {
      x: el.x ?? 0,
      y: el.y ?? 0,
      width: el.width ?? 0,
      height: el.height ?? 0,
      ...(el.textSize ? { textSize: el.textSize } : {}),
    };
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const local = unrotate(cursor, centre, el.rotation ?? 0);
    const count = el.entityFields?.length ?? 0;
    const part = entityPartAt(box, count, local);
    if (!part) continue;
    // The topmost entity under the pointer decides: over its title or empty body there is no field.
    if (part.kind !== 'field') return null;
    const side = unrotate(toward, centre, el.rotation ?? 0).x < centre.x ? 'w' : 'e';
    const at = entityFieldPoint(box, side, part.index, count)!;
    return {
      elementId: el.id,
      anchor: side,
      field: part.index,
      point: el.rotation ? rotatePoint(at, centre, el.rotation) : at,
    };
  }
  return null;
}

const unrotate = (p: { x: number; y: number }, c: { x: number; y: number }, deg: number) =>
  deg ? rotatePoint(p, c, -deg) : p;

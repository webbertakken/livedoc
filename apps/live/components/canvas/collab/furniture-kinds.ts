import {
  isOfficeShape,
  isSeatingShape,
  type OfficeKind,
  type SeatingKind,
} from '@livedoc/document';

/** Whether FurnitureView draws this kind: seating, and every office piece but the room (RoomView). Base, so a board
 *  routes a piece to its face without the office and seating family's drawings (docs/specs/016-platform/web-performance.md). */
export function isFurnitureViewShape(
  kind: string,
): kind is SeatingKind | Exclude<OfficeKind, 'room'> {
  return isSeatingShape(kind) || (isOfficeShape(kind) && kind !== 'room');
}

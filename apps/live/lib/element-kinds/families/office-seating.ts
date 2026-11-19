// The office furniture and seating family (docs/specs/016-platform/web-performance.md): chairs, desks, sofas, the
// meeting table, plants, bookshelves, the water cooler, the coffee machine, rugs and rooms. Their faces and the
// drawings they paint (seating-art.ts and office-art.ts in @livedoc/document), and the seats a character sits on.
// Loaded through the registry (lib/element-kinds), never imported statically; their kinds, facing, walls and
// footprints stay base.
export { FurnitureView } from '@/components/canvas/collab/FurnitureView';
export { RoomView } from '@/components/canvas/collab/RoomView';
export {
  FURNITURE_ART,
  OFFICE_ART,
  furnitureFrame,
  nearestSeat,
  roomParts,
  seatPoints,
} from '@livedoc/document';

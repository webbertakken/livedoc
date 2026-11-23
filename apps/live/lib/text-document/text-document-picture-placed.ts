// A placed picture's drawing (docs/specs/034-text-documents/objects.md "In the editor"): where its box stands from its
// paragraph's top left (a page-fixed one moved by its paragraph's place on its page), the layer it is drawn in, and
// the room a Wrap or Break picture keeps the text clear of: its turned bounds and margins, below its paragraph's top,
// beside it on the side of the column with more room, or across the column. Pure; lengths in points.
import { PicturePlacements, Pictures } from '@livedoc/text-documents';
import { INDENT_START } from './text-document-style-sheet';

/** The layer a placed picture is drawn in: with the text making room for it, over the text, or under it. */
export type PlacedLayer = 'flow' | 'front' | 'behind';

/** Where a Wrap or Break picture's room floats: the picture on the left, on the right, or across its column. */
export type PlacedRoomSide = 'left' | 'right' | 'across';

/** The room the text keeps clear of, from its paragraph's top and its column's left edge. */
export type PlacedRoom = {
  readonly side: PlacedRoomSide;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
};

export type PlacedLayout = {
  /** The picture's box, unturned, from its paragraph's top left. */
  readonly picture: { readonly left: number; readonly top: number };
  readonly layer: PlacedLayer;
  readonly room?: PlacedRoom;
};

/** How far a page-fixed picture's paragraph stands from its page's top left corner, negated: added to its offsets. */
export type PlacedShift = { readonly x: number; readonly y: number };

const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;
const length = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** A picture's placed drawing in a column `columnWidth` wide, or null for a picture in line. */
export function placedLayout(
  attrs: Readonly<Record<string, unknown>>,
  columnWidth: number,
  shift: PlacedShift = { x: 0, y: 0 },
): PlacedLayout | null {
  const placement = PicturePlacements.of(attrs.placement);
  if (!placement) return null;
  const moved = placement.moves === 'page' ? shift : { x: 0, y: 0 };
  const left = round3(placement.x + moved.x);
  const top = round3(placement.y + moved.y);
  const picture = { left, top };
  if (placement.wrap === 'front' || placement.wrap === 'behind')
    return { picture, layer: placement.wrap };
  const width = length(attrs.width);
  const height = length(attrs.height);
  const bounds = Pictures.turnedBounds({ width, height }, Pictures.rotation(attrs.rotation) ?? 0);
  const boundsLeft = left + (width - bounds.width) / 2;
  const boundsTop = top + (height - bounds.height) / 2;
  const { margin } = placement;
  const bottom = round3(boundsTop + bounds.height + margin.bottom);
  // Wholly above its paragraph's top: the text makes no room for it.
  if (bottom <= 0) return { picture, layer: 'flow' };
  const side: PlacedRoomSide =
    placement.wrap === 'break'
      ? 'across'
      : boundsLeft + bounds.width / 2 >= columnWidth / 2
        ? 'right'
        : 'left';
  return {
    picture,
    layer: 'flow',
    room: {
      side,
      top: round3(Math.max(0, boundsTop - margin.top)),
      bottom,
      left: round3(boundsLeft - margin.left),
      right: round3(boundsLeft + bounds.width + margin.right),
    },
  };
}

// A paragraph's start indent, which its floats stand inside (text-document-style-sheet.ts INDENT_START).
const INDENT = `var(${INDENT_START}, 0pt)`;

/**
 * The CSS of a room's float, at its paragraph's start: as high as the room's foot, as wide as from the paragraph's
 * text edge to the picture's far side, its shape (what the text keeps clear of) the room itself.
 */
export function roomStyle(room: PlacedRoom): string {
  const across = round3(room.right - room.left);
  if (room.side === 'across')
    return `float: left; height: ${room.bottom}pt; width: 100%; shape-outside: inset(${room.top}pt 0 0 0)`;
  const inset = `max(0pt, calc(100% - ${across}pt))`;
  if (room.side === 'left')
    return (
      `float: left; height: ${room.bottom}pt; width: max(0pt, calc(${room.right}pt - ${INDENT})); ` +
      `shape-outside: inset(${room.top}pt 0 0 ${inset})`
    );
  return (
    `float: right; height: ${room.bottom}pt; width: max(0pt, calc(100% - ${room.left}pt + ${INDENT})); ` +
    `shape-outside: inset(${room.top}pt ${inset} 0 0)`
  );
}

/** The class of a Wrap or Break picture's room, floated at its paragraph's start. */
export const PLACED_ROOM_CLASS = 'text-document-placed-room';
/** The class of a placed picture's anchor, which draws its box. */
export const PLACED_PICTURE_CLASS = 'text-document-picture-placed';

// The grid's scroll room (docs/specs/029-sheets/grid-and-editing.md "The grid", surface.md D134): a sheet larger than
// the room scrolls through it in proportion, so the scroll container never grows past a browser's ceiling on an
// element's size (Firefox ignores heights past 17,895,697 px). The cells are drawn from the sheet's own scroll, in
// sheet pixels; the container's is in room pixels. Pure, but for the registry the grid keeps for its scrollers.

/** The most an axis of the scroll container is laid out, in px (D134). */
export const SCROLL_ROOM_MAX_PX = 10_000_000;

type Size = { width: number; height: number };
type Scroll = { top: number; left: number };

export type ScrollRoom = {
  /** The scroll container's content size: the sheet's, or the room where the sheet is larger. */
  spacer: Size;
  /** Sheet px per room px on each axis: 1 when the sheet fits. */
  ratio: { x: number; y: number };
};

// Sheet px per room px: the sheet's scroll range over the room's, so both ends meet.
function axisRatio(content: number, view: number, max: number): number {
  if (content <= max) return 1;
  return Math.max(0, content - view) / Math.max(1, max - view);
}

/** The room for a sheet of `content` px (headers and footer included) seen through `view`. */
export function scrollRoom(content: Size, view: Size, max = SCROLL_ROOM_MAX_PX): ScrollRoom {
  return {
    spacer: { width: Math.min(content.width, max), height: Math.min(content.height, max) },
    ratio: {
      x: axisRatio(content.width, view.width, max),
      y: axisRatio(content.height, view.height, max),
    },
  };
}

/** The sheet's scroll for the container's. */
export const sheetScrollOf = (room: ScrollRoom, dom: Scroll): Scroll => ({
  top: dom.top * room.ratio.y,
  left: dom.left * room.ratio.x,
});

/** The container's scroll for the sheet's. */
export const domScrollOf = (room: ScrollRoom, sheet: Scroll): Scroll => ({
  top: sheet.top / room.ratio.y,
  left: sheet.left / room.ratio.x,
});

// Each grid's room, by its scroll container: what a pan or an edge drag reads to move the cells by sheet pixels.
const rooms = new WeakMap<HTMLElement, ScrollRoom>();

export const keepScrollRoom = (el: HTMLElement, room: ScrollRoom): void => void rooms.set(el, room);

/** Room px per sheet px on each axis for a scroller: what a move of sheet pixels takes in its own. */
export function roomPerSheetPx(el: HTMLElement): { x: number; y: number } {
  const room = rooms.get(el);
  return room ? { x: 1 / room.ratio.x, y: 1 / room.ratio.y } : { x: 1, y: 1 };
}

// A selected placed picture dragged (docs/specs/034-text-documents/objects.md "Dragging a placed picture", "Guides"):
// its box follows the pointer from its paragraph's top left, its edges and centre snapping across to its column's within
// 4 px on the screen, the line it snaps to shown. Drawn, not written: on release the move is given back once, Escape or
// a cancelled pointer giving back nothing.
import { snapAcross } from './text-document-picture-placing';

// Points to CSS pixels, before the zoom.
const PX_PER_PT = 96 / 72;
/** How near, in screen pixels, an edge or centre snaps to its column's. */
export const PICTURE_SNAP_PX = 4;
// A move smaller than this, in points, is no move.
const STILL_PT = 0.01;

/** What a drag moved the picture by, in points across and down. */
export type PictureMove = { readonly dx: number; readonly dy: number };

export function movePlacedPicture(
  down: PointerEvent,
  {
    turn,
    start,
    preview,
    done,
  }: {
    // The picture's box, laid out from its paragraph's top left.
    turn: HTMLElement;
    // Its box as the drag begins: its top left from its paragraph's and its width, in points.
    start: { left: number; top: number; width: number };
    // Draws the box at a top left, and the column's line it snapped to (null for none).
    preview: (left: number, top: number, guide: number | null) => void;
    // Told once, as the drag ends: what it moved by, or null (cancelled, or not moved).
    done: (moved: PictureMove | null) => void;
  },
): (write: boolean) => void {
  const paragraph = turn.offsetParent instanceof HTMLElement ? turn.offsetParent : null;
  const width = paragraph?.offsetWidth ?? 0;
  const zoom = paragraph && width > 0 ? paragraph.getBoundingClientRect().width / width : 1;
  const pixelsAPoint = PX_PER_PT * zoom;
  const columnWidth = width / PX_PER_PT;
  let made: PictureMove | null = null;
  const move = (e: PointerEvent) => {
    const dy = (e.clientY - down.clientY) / pixelsAPoint;
    const across = start.left + (e.clientX - down.clientX) / pixelsAPoint;
    const snap =
      columnWidth > 0
        ? snapAcross(across, start.width, columnWidth, PICTURE_SNAP_PX / pixelsAPoint)
        : { left: across, guide: null };
    const dx = snap.left - start.left;
    made = Math.abs(dx) < STILL_PT && Math.abs(dy) < STILL_PT ? null : { dx, dy };
    preview(snap.left, start.top + dy, snap.guide);
  };
  const up = () => end(true);
  const cancel = () => end(false);
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    cancel();
  };
  let ended = false;
  function end(write: boolean) {
    if (ended) return;
    ended = true;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    done(write ? made : null);
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
  return end;
}

// A mark's handles as they show (docs/specs/035-pdf-documents/marks.md "Changing a mark"): where each sits in view
// space, and the mark's geometry with one dragged. A box's handles are named for where they show, so the handle on the
// right sizes the side that shows on the right whatever the page's turn; ⇧ with a corner keeps the box's proportions;
// the box stays at least PDF_SHAPE_MIN_PT each way and on its page. ⌥ with an arrow key is the foot-right corner, or a
// line's second end, moved the way the arrow points.
import {
  MarkReshape,
  PageView,
  PDF_SHAPE_MIN_PT,
  type Box,
  type BoxHandle,
  type Mark,
  type MarkHandle,
  type MarkPlace,
  type PageMatrix,
  type PagePoint,
} from '@livedoc/pdf-documents';

/** A handle and where it shows, in view space. */
export type HandlePlace = { readonly handle: MarkHandle; readonly at: PagePoint };

type ViewBox = { left: number; top: number; right: number; bottom: number };

/** A box of page space as it shows: the smallest upright box in view space holding its corners. */
function viewBoxOf(matrix: PageMatrix, [left, bottom, right, top]: Box): ViewBox {
  const corners = [
    PageView.toView(matrix, { x: left, y: bottom }),
    PageView.toView(matrix, { x: right, y: top }),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/** Where a box handle shows on a box in view space. */
function boxHandleAt(handle: BoxHandle, box: ViewBox): PagePoint {
  const x = handle.includes('w')
    ? box.left
    : handle.includes('e')
      ? box.right
      : (box.left + box.right) / 2;
  const y = handle.includes('n')
    ? box.top
    : handle.includes('s')
      ? box.bottom
      : (box.top + box.bottom) / 2;
  return { x, y };
}

const within = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));

/** A point of view space on the page, in page space; null for a matrix that cannot be turned back. */
function onPage(matrix: PageMatrix, at: PagePoint, page: Box): PagePoint | null {
  const point = PageView.toPage(matrix, at);
  return point
    ? { x: within(point.x, page[0], page[2]) + 0, y: within(point.y, page[1], page[3]) + 0 }
    : null;
}

/** Each of a mark's handles and where it shows. */
export function handlePlaces(mark: Mark, matrix: PageMatrix): readonly HandlePlace[] {
  const box = MarkReshape.box(mark);
  const shown = box ? viewBoxOf(matrix, box) : null;
  return MarkReshape.handles(mark).map((handle) => {
    const point = MarkReshape.at(mark, handle);
    return {
      handle,
      at: point
        ? PageView.toView(matrix, point)
        : boxHandleAt(handle as BoxHandle, shown as ViewBox),
    };
  });
}

/** The box in view space with the sides a handle sits on moved to `to`, at least the least size; ⇧ in proportion. */
function dragged(was: ViewBox, handle: BoxHandle, to: PagePoint, square: boolean): ViewBox {
  const box = { ...was };
  if (handle.includes('w')) box.left = Math.min(to.x, was.right - PDF_SHAPE_MIN_PT);
  if (handle.includes('e')) box.right = Math.max(to.x, was.left + PDF_SHAPE_MIN_PT);
  if (handle.includes('n')) box.top = Math.min(to.y, was.bottom - PDF_SHAPE_MIN_PT);
  if (handle.includes('s')) box.bottom = Math.max(to.y, was.top + PDF_SHAPE_MIN_PT);
  const wide = was.right - was.left;
  const high = was.bottom - was.top;
  if (!square || handle.length !== 2 || wide === 0 || high === 0) return box;
  const scale = Math.max((box.right - box.left) / wide, (box.bottom - box.top) / high);
  if (handle.includes('w')) box.left = was.right - wide * scale;
  else box.right = was.left + wide * scale;
  if (handle.includes('n')) box.top = was.bottom - high * scale;
  else box.bottom = was.top + high * scale;
  return box;
}

/**
 * The mark's geometry with `handle` dragged to `to`, a point of view space; `square`: ⇧ held. Null where the mark has
 * no such handle, or the matrix cannot be turned back.
 */
export function dragHandle(
  mark: Mark,
  handle: MarkHandle,
  matrix: PageMatrix,
  to: PagePoint,
  square: boolean,
  page: Box,
): MarkPlace | null {
  if (!MarkReshape.handles(mark).includes(handle)) return null;
  if (MarkReshape.at(mark, handle)) {
    const point = onPage(matrix, to, page);
    return point
      ? MarkReshape.pointed(mark, handle as Exclude<MarkHandle, BoxHandle>, point)
      : null;
  }
  const box = dragged(viewBoxOf(matrix, MarkReshape.box(mark)!), handle as BoxHandle, to, square);
  const one = onPage(matrix, { x: box.left, y: box.top }, page);
  const other = onPage(matrix, { x: box.right, y: box.bottom }, page);
  if (!one || !other) return null;
  return MarkReshape.reboxed(mark, [
    Math.min(one.x, other.x),
    Math.min(one.y, other.y),
    Math.max(one.x, other.x),
    Math.max(one.y, other.y),
  ]);
}

/** ⌥ with an arrow key: the foot-right corner as it shows, or a line's second end, moved `step` in view space. */
export function keyResize(
  mark: Mark,
  matrix: PageMatrix,
  step: PagePoint,
  page: Box,
): MarkPlace | null {
  const places = handlePlaces(mark, matrix);
  const handle = places.find((place) => place.handle === 'end' || place.handle === 'se');
  if (!handle) return null;
  const to = { x: handle.at.x + step.x, y: handle.at.y + step.y };
  return dragHandle(mark, handle.handle, matrix, to, false, page);
}

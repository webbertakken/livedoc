// A mark resized by its handles (docs/specs/035-pdf-documents/marks.md "Changing a mark": Handles, what a box's new size
// does, a line's end, a Callout's tip and knee): which handles a kind has, the box its box handles size, the mark's
// geometry in a new box, and a point handle moved. A text mark has none: it is the glyphs it covers. Pure geometry in
// page space; which way a handle points on screen is the surface's.
import type { PagePoint } from './engine-contract';
import { PDF_TEXT_PADDING_PT } from './limits';
import { Mark, type Box, type CalloutLine, type Stroke, type TypedMark } from './mark';
import type { MarkPlace } from './mark-place';
import { TypedLayout } from './typed-layout';

/** A box's handles, named for where they sit as the box shows; a line's two ends; a Callout's tip and knee. */
export const BOX_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type BoxHandle = (typeof BOX_HANDLES)[number];
export type PointHandle = 'start' | 'end' | 'tip' | 'knee';
export type MarkHandle = BoxHandle | PointHandle;

/** Where `n` falls in the span `from`, mapped onto the span `to`; a span of no length keeps its offset. */
const remap = (
  n: number,
  from: readonly [number, number],
  to: readonly [number, number],
): number =>
  from[1] === from[0]
    ? n - from[0] + to[0]
    : to[0] + ((n - from[0]) / (from[1] - from[0])) * (to[1] - to[0]);

/** A Text's or a Callout's box in `box`: at least one character wide, and as high as its words, growing down. */
function typedBox(
  mark: Mark & { words: string; size: number },
  [left, bottom, right, top]: Box,
): Box {
  const wide = Math.max(right - left, mark.size + 2 * PDF_TEXT_PADDING_PT);
  const lines = TypedLayout.lines(mark.words, mark.size, wide).length;
  const high = Math.max(top - bottom, TypedLayout.height(lines, mark.size));
  return [left, top - high, left + wide, top];
}

export const MarkReshape = {
  /** The handles a mark is resized by. */
  handles: (mark: Mark): readonly MarkHandle[] => {
    if (Mark.isText(mark)) return [];
    if ('line' in mark) return ['start', 'end'];
    return mark.kind === 'callout' ? [...BOX_HANDLES, 'tip', 'knee'] : BOX_HANDLES;
  },

  /** The box a mark's box handles size: its rect, or a Drawing's bounds; null for a line or a text mark. */
  box: (mark: Mark): Box | null => {
    if (Mark.isText(mark) || 'line' in mark) return null;
    return mark.kind === 'drawing' ? Mark.bounds(mark) : mark.rect;
  },

  /** The mark's geometry in the box given; null for a mark with no box. */
  reboxed: (mark: Mark, box: Box): MarkPlace | null => {
    const was = MarkReshape.box(mark);
    if (!was) return null;
    if (mark.kind === 'drawing') {
      const xs = [was[0], was[2]] as const;
      const ys = [was[1], was[3]] as const;
      const strokes = mark.strokes.map((stroke): Stroke =>
        stroke.map((n, at) =>
          at % 2 === 0 ? remap(n, xs, [box[0], box[2]]) : remap(n, ys, [box[1], box[3]]),
        ),
      );
      return { strokes };
    }
    if (mark.kind === 'text') return { rect: typedBox(mark, box) };
    if (mark.kind === 'callout') {
      const rect = typedBox(mark, box);
      const [x, y] = mark.callout;
      return { rect, callout: TypedLayout.calloutLine({ x, y }, rect) };
    }
    return { rect: box };
  },

  /**
   * A Text's or a Callout's geometry at a new size (marks.md "Changing a mark": what a new size does): its words wrapped
   * again in its box, which keeps its top, left and width, grows down to hold them and moves up onto `page` where it
   * would pass its foot; a Callout's line run again to the side facing its tip.
   */
  sized: (mark: TypedMark, size: number, page: Box): MarkPlace => {
    const [left, bottom, right, top] = typedBox({ ...mark, size }, mark.rect);
    const up = Math.max(0, page[1] - bottom);
    const rect: Box = [left, bottom + up, right, top + up];
    if (mark.kind === 'text') return { rect };
    const [x, y] = mark.callout;
    return { rect, callout: TypedLayout.calloutLine({ x, y }, rect) };
  },

  /** Where a point handle sits in page space; null for a box handle or a handle the mark has not. */
  at: (mark: Mark, handle: MarkHandle): PagePoint | null => {
    if ('line' in mark && (handle === 'start' || handle === 'end')) {
      const at = handle === 'start' ? 0 : 2;
      return { x: mark.line[at], y: mark.line[at + 1]! };
    }
    if (mark.kind === 'callout' && (handle === 'tip' || handle === 'knee')) {
      const at = handle === 'tip' ? 0 : 2;
      return { x: mark.callout[at], y: mark.callout[at + 1]! };
    }
    return null;
  },

  /** The mark's geometry with a point handle moved to `to`; null where the mark has no such handle. */
  pointed: (mark: Mark, handle: PointHandle, to: PagePoint): MarkPlace | null => {
    if (MarkReshape.at(mark, handle) === null) return null;
    if ('line' in mark) {
      const [x1, y1, x2, y2] = mark.line;
      return { line: handle === 'start' ? [to.x, to.y, x2, y2] : [x1, y1, to.x, to.y] };
    }
    const callout = mark as Mark & { rect: Box; callout: CalloutLine };
    if (handle === 'tip')
      return { rect: callout.rect, callout: TypedLayout.calloutLine(to, callout.rect) };
    const [tipX, tipY, , , endX, endY] = callout.callout;
    return { rect: callout.rect, callout: [tipX, tipY, to.x, to.y, endX, endY] };
  },
} as const;

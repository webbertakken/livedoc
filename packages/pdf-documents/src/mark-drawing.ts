// How a mark is drawn (docs/specs/035-pdf-documents/marks.md "Making a mark": How a text mark is drawn; A Drawing),
// in page space: a text mark each glyph quadrilateral on its own, a fill for a Highlight, a line for the others; a
// Drawing its strokes, round. Pure geometry, so the
// surface's overlay and the canvas pictures (a thumbnail, a print) draw one mark the same way.
import type { PagePoint } from './engine-contract';
import { PDF_MARK_LINE_PT, PDF_SQUIGGLE_STEP_PT } from './limits';
import type { DrawingMark, Quad, Stroke, TextMark, TextMarkKind } from './mark';

/** What of a mark its drawing reads. */
export type MarkShape =
  Pick<TextMark, 'kind' | 'quads'> | Pick<DrawingMark, 'kind' | 'strokes' | 'width'>;

/** A line through its points, `width` points wide; `round` its ends and corners (a Drawing's). */
export type MarkStroke = {
  readonly points: readonly PagePoint[];
  readonly width: number;
  readonly round: boolean;
};

export type MarkDrawing = {
  /** Closed outlines to fill, each a quad's corners around its edge. */
  readonly fills: readonly (readonly PagePoint[])[];
  readonly strokes: readonly MarkStroke[];
};

const corner = (quad: Quad, at: number): PagePoint => ({ x: quad[at]!, y: quad[at + 1]! });
const middle = (a: PagePoint, b: PagePoint): PagePoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

// The standard orders a quad upper left, upper right, lower left, lower right: around its edge is 0, 1, 3, 2.
const around = (quad: Quad): PagePoint[] => [0, 2, 6, 4].map((at) => corner(quad, at));

/** A zigzag from `from` to `to`, its teeth a step wide and a step high towards `top`; one tooth at the least. */
function teeth(from: PagePoint, to: PagePoint, top: PagePoint): PagePoint[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return [from, to];
  const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const rise = Math.hypot(top.x - from.x, top.y - from.y);
  // Towards the quad's top; a quad with no height stands its teeth square to the line.
  const up =
    rise === 0
      ? { x: -along.y, y: along.x }
      : { x: (top.x - from.x) / rise, y: (top.y - from.y) / rise };
  const count = Math.max(1, Math.floor(length / PDF_SQUIGGLE_STEP_PT));
  const wide = length / count;
  return Array.from({ length: count + 1 }, (_, at) => {
    const raised = at % 2 === 1 && at < count ? PDF_SQUIGGLE_STEP_PT : 0;
    return {
      x: from.x + along.x * wide * at + up.x * raised,
      y: from.y + along.y * wide * at + up.y * raised,
    };
  });
}

const LINES: Readonly<Record<Exclude<TextMarkKind, 'highlight'>, (quad: Quad) => PagePoint[]>> = {
  underline: (quad) => [corner(quad, 4), corner(quad, 6)],
  strikeout: (quad) => [
    middle(corner(quad, 0), corner(quad, 4)),
    middle(corner(quad, 2), corner(quad, 6)),
  ],
  squiggly: (quad) => teeth(corner(quad, 4), corner(quad, 6), corner(quad, 0)),
};

// A stroke's flat x, y pairs as points; a stroke of one point is that point twice, so its round ends draw a dot.
const pointsOf = (stroke: Stroke): PagePoint[] => {
  const points = Array.from({ length: stroke.length / 2 }, (_, at) => ({
    x: stroke[at * 2]!,
    y: stroke[at * 2 + 1]!,
  }));
  return points.length === 1 ? [points[0]!, points[0]!] : points;
};

export const MarkDrawing = {
  /** What a mark draws, in page space. */
  of: (mark: MarkShape): MarkDrawing => {
    if (mark.kind === 'drawing')
      return {
        fills: [],
        strokes: mark.strokes.map((stroke) => ({
          points: pointsOf(stroke),
          width: mark.width,
          round: true,
        })),
      };
    const { kind, quads } = mark;
    return kind === 'highlight'
      ? { fills: quads.map(around), strokes: [] }
      : {
          fills: [],
          strokes: quads.map((quad) => ({
            points: LINES[kind](quad),
            width: PDF_MARK_LINE_PT,
            round: false,
          })),
        };
  },
} as const;

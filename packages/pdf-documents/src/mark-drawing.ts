// How a mark is drawn (docs/specs/035-pdf-documents/marks.md "Making a mark": How a text mark is drawn; A Drawing), in
// page space: a text mark each glyph quadrilateral on its own, a fill for a Highlight, a line for the others; a Drawing
// its strokes, round; a Line from end to end, an Arrow with an open head; a Rectangle round its box and an Ellipse
// within it, each closed; a Callout its line, its head at what is meant, and its box's border (a Text's words and a
// Callout's are TypedLayout's); a stamp its rounded border (its words StampLayout's); a line's style its pattern, a
// fill inside a shape's line (marks.md "Changing a mark"). Pure geometry, so the surface's overlay, the canvas pictures
// (a thumbnail, a print) and the appearance a bake writes draw one mark the same way.
import type { PagePoint } from './engine-contract';
import {
  PDF_ARROW_HEAD_MIN_PT,
  PDF_ARROW_HEAD_WIDTHS,
  PDF_MARK_LINE_PT,
  PDF_SQUIGGLE_STEP_PT,
} from './limits';
import type {
  CalloutMark,
  DrawingMark,
  LineEnd,
  LineMark,
  LineStyle,
  Quad,
  ShapeMark,
  StampMark,
  Stroke,
  TextMark,
  TextBoxMark,
  TextMarkKind,
} from './mark';
import { Mark } from './mark';
import { StampLayout } from './stamp-layout';

/** What of a mark its drawing reads. */
export type LineShape = Pick<LineMark, 'kind' | 'line' | 'width' | 'lineStyle' | 'lineEnd'>;
export type BoxShape = Pick<ShapeMark, 'kind' | 'rect' | 'width' | 'lineStyle' | 'fill'>;
export type TypedShape =
  Pick<TextBoxMark, 'kind' | 'rect'> | Pick<CalloutMark, 'kind' | 'rect' | 'callout'>;
export type StampShape = Pick<StampMark, 'kind' | 'rect' | 'lines'>;
export type MarkShape =
  | Pick<TextMark, 'kind' | 'quads'>
  | Pick<DrawingMark, 'kind' | 'strokes' | 'width' | 'lineStyle'>
  | LineShape
  | BoxShape
  | TypedShape
  | StampShape;

/** A line through its points, `width` points wide; `round` its ends and corners (a Drawing's); `closed` back to its
 *  first point, its last corner joined as the others are (a Rectangle's, an Ellipse's). */
export type MarkStroke = {
  readonly points: readonly PagePoint[];
  readonly width: number;
  readonly round: boolean;
  readonly closed: boolean;
  /** Its line style's pattern in points, drawn and apart in turn; absent for a solid line. */
  readonly dash?: readonly number[];
};

export type MarkDrawing = {
  /** Closed outlines to fill, each a quad's corners around its edge. */
  readonly fills: readonly (readonly PagePoint[])[];
  readonly strokes: readonly MarkStroke[];
  /** A shape's inside, painted under its line in its own colour; absent where it has no fill. */
  readonly fill?: { readonly points: readonly PagePoint[]; readonly colour: string };
};

/** (default) Each line style's pattern, in lengths of its line's width, drawn and apart in turn. */
const LINE_STYLE_PATTERNS: Readonly<Record<LineStyle, readonly number[]>> = {
  solid: [],
  dashed: [3, 2],
  dotted: [1, 1],
  'dash-dot': [3, 1, 1, 1],
  'long-dashes': [6, 2],
};
/** (default) The shortest length a pattern's step is, in points, so a thin line's dots still show. */
const PATTERN_MIN_STEP_PT = 1;

/** A line style's pattern for a line `width` points wide, in points. */
const patternOf = (style: LineStyle, width: number): number[] =>
  LINE_STYLE_PATTERNS[style].map((step) => step * Math.max(width, PATTERN_MIN_STEP_PT));

/** A stroke given its mark's line style, where it has one. */
const styled = (stroke: MarkStroke, style: LineStyle | undefined): MarkStroke =>
  style && style !== 'solid' ? { ...stroke, dash: patternOf(style, stroke.width) } : stroke;

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

/** The points of an Ellipse's outline: enough that no side of it shows, at any size a page holds. */
const ELLIPSE_POINTS = 72;
/** An arrowhead's sides' angle to its line (marks.md "Making a mark"). */
const ARROW_HEAD_ANGLE = Math.PI / 6;

const line = (points: PagePoint[], width: number, closed = false): MarkStroke => ({
  points,
  width,
  round: false,
  closed,
});

/** An arrowhead's side, and every line end's size, for a line `width` points wide. */
const headSide = (width: number): number =>
  Math.max(PDF_ARROW_HEAD_MIN_PT, PDF_ARROW_HEAD_WIDTHS * width);

/** The points of a line end's Circle: enough that no side of it shows at the sizes a head is drawn. */
const RING_POINTS = 24;

/** An open arrowhead at `tip`, pointing away from `from`: one side, the tip, the other side. */
function head(from: PagePoint, tip: PagePoint, width: number): PagePoint[] {
  const side = headSide(width);
  const length = Math.hypot(tip.x - from.x, tip.y - from.y);
  if (length === 0) return [tip, tip, tip];
  const back = Math.atan2(from.y - tip.y, from.x - tip.x);
  const wing = (turn: number): PagePoint => ({
    x: tip.x + side * Math.cos(back + turn),
    y: tip.y + side * Math.sin(back + turn),
  });
  return [wing(-ARROW_HEAD_ANGLE), tip, wing(ARROW_HEAD_ANGLE)];
}

/** A line end at `tip`, its line coming from `from` (marks.md "Changing a mark": how a line end is drawn). */
function endDrawing(end: LineEnd, from: PagePoint, tip: PagePoint, width: number): MarkDrawing {
  if (end === 'none') return { fills: [], strokes: [] };
  if (end === 'open-arrow') return { fills: [], strokes: [line(head(from, tip, width), width)] };
  if (end === 'arrow') {
    const wings = head(from, tip, width);
    return { fills: [wings], strokes: [line(wings, width, true)] };
  }
  const half = headSide(width) / 2;
  const length = Math.hypot(tip.x - from.x, tip.y - from.y);
  // Along the line towards its tip, and across it; a line of no length stands its end upright.
  const along =
    length === 0 ? { x: 1, y: 0 } : { x: (tip.x - from.x) / length, y: (tip.y - from.y) / length };
  const across = { x: -along.y, y: along.x };
  const at = (a: number, c: number): PagePoint => ({
    x: tip.x + along.x * a + across.x * c,
    y: tip.y + along.y * a + across.y * c,
  });
  const outlines: Readonly<Record<'circle' | 'square' | 'diamond' | 'bar', () => MarkStroke>> = {
    circle: () =>
      line(
        Array.from({ length: RING_POINTS }, (_, n) => {
          const angle = (n / RING_POINTS) * 2 * Math.PI;
          return at(half * Math.cos(angle), half * Math.sin(angle));
        }),
        width,
        true,
      ),
    square: () =>
      line([at(half, half), at(half, -half), at(-half, -half), at(-half, half)], width, true),
    diamond: () => line([at(half, 0), at(0, -half), at(-half, 0), at(0, half)], width, true),
    bar: () => line([at(0, half), at(0, -half)], width),
  };
  return { fills: [], strokes: [outlines[end]()] };
}

function lineDrawing({
  kind,
  line: [x1, y1, x2, y2],
  width,
  lineStyle,
  lineEnd,
}: LineShape): MarkDrawing {
  const from = { x: x1, y: y1 };
  const to = { x: x2, y: y2 };
  const end = endDrawing(lineEnd ?? Mark.firstEnd(kind), from, to, width);
  return {
    fills: end.fills,
    strokes: [styled(line([from, to], width), lineStyle), ...end.strokes],
  };
}

/** A Rectangle's or an Ellipse's outline, styled, and its fill inside it. */
function outlined(points: PagePoint[], { width, lineStyle, fill }: BoxShape): MarkDrawing {
  return {
    fills: [],
    strokes: [styled(line(points, width, true), lineStyle)],
    ...(fill ? { fill: { points, colour: fill } } : {}),
  };
}

function shapeDrawing(shape: BoxShape): MarkDrawing {
  const {
    kind,
    rect: [left, bottom, right, top],
  } = shape;
  if (kind === 'rectangle') {
    const corners = [
      { x: left, y: bottom },
      { x: right, y: bottom },
      { x: right, y: top },
      { x: left, y: top },
    ];
    return outlined(corners, shape);
  }
  const centre = { x: (left + right) / 2, y: (bottom + top) / 2 };
  const outline = Array.from({ length: ELLIPSE_POINTS }, (_, at) => {
    const angle = (at / ELLIPSE_POINTS) * 2 * Math.PI;
    return {
      x: centre.x + ((right - left) / 2) * Math.cos(angle),
      y: centre.y + ((top - bottom) / 2) * Math.sin(angle),
    };
  });
  return outlined(outline, shape);
}

/** A Callout's line through its knee, an open head at what is meant, and its box's border; a Text's nothing. */
function typedDrawing(mark: TypedShape): MarkDrawing {
  if (mark.kind === 'text') return { fills: [], strokes: [] };
  const [tipX, tipY, kneeX, kneeY, endX, endY] = mark.callout;
  const tip = { x: tipX, y: tipY };
  const knee = { x: kneeX, y: kneeY };
  const [left, bottom, right, top] = mark.rect;
  const border = [
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: right, y: top },
    { x: left, y: top },
  ];
  return {
    fills: [],
    strokes: [
      line([tip, knee, { x: endX, y: endY }], PDF_MARK_LINE_PT),
      line(head(knee, tip, PDF_MARK_LINE_PT), PDF_MARK_LINE_PT),
      line(border, PDF_MARK_LINE_PT, true),
    ],
  };
}

export const MarkDrawing = {
  /** A line style's pattern for a line `width` points wide, in points: empty for Solid. */
  pattern: patternOf,

  /** What a mark draws, in page space. */
  of: (mark: MarkShape): MarkDrawing => {
    if (mark.kind === 'drawing')
      return {
        fills: [],
        strokes: mark.strokes.map((stroke) =>
          styled(
            { points: pointsOf(stroke), width: mark.width, round: true, closed: false },
            mark.lineStyle,
          ),
        ),
      };
    if ('line' in mark) return lineDrawing(mark);
    if (mark.kind === 'text' || mark.kind === 'callout') return typedDrawing(mark);
    if (mark.kind === 'stamp') return { fills: [], strokes: [StampLayout.border(mark)] };
    if ('rect' in mark) return shapeDrawing(mark);
    const { kind, quads } = mark;
    return kind === 'highlight'
      ? { fills: quads.map(around), strokes: [] }
      : {
          fills: [],
          strokes: quads.map((quad) => ({
            points: LINES[kind](quad),
            width: PDF_MARK_LINE_PT,
            round: false,
            closed: false,
          })),
        };
  },
} as const;

import { describe, expect, it } from 'vitest';
import {
  PDF_ARROW_HEAD_MIN_PT,
  PDF_ARROW_HEAD_WIDTHS,
  PDF_CLOUD_ARC_PT,
  PDF_MARK_LINE_PT,
  PDF_SQUIGGLE_STEP_PT,
} from './limits';
import type { LineEnd, Quad } from './mark';
import { MarkDrawing } from './mark-drawing';
import { StampLayout } from './stamp-layout';

// A line of text 16 points high and 100 wide, its foot at y 700.
const LINE: Quad = [100, 716, 200, 716, 100, 700, 200, 700];
// The same, slanted: its foot rises 10 points over its width.
const SLANTED: Quad = [100, 716, 200, 726, 100, 700, 200, 710];

describe('MarkDrawing', () => {
  // marks.md "Making a mark": a Highlight fills each glyph quadrilateral.
  it('fills a highlight’s quads around their edge', () => {
    expect(MarkDrawing.of({ kind: 'highlight', quads: [LINE] })).toEqual({
      fills: [
        [
          { x: 100, y: 716 },
          { x: 200, y: 716 },
          { x: 200, y: 700 },
          { x: 100, y: 700 },
        ],
      ],
      strokes: [],
    });
  });

  // marks.md: an Underline is a 1-point line along each quad's foot.
  it('draws an underline along each quad’s foot', () => {
    expect(MarkDrawing.of({ kind: 'underline', quads: [LINE, SLANTED] })).toEqual({
      fills: [],
      strokes: [
        {
          points: [
            { x: 100, y: 700 },
            { x: 200, y: 700 },
          ],
          width: PDF_MARK_LINE_PT,
          round: false,
          closed: false,
        },
        {
          points: [
            { x: 100, y: 700 },
            { x: 200, y: 710 },
          ],
          width: PDF_MARK_LINE_PT,
          round: false,
          closed: false,
        },
      ],
    });
  });

  // marks.md: a Strikethrough is a 1-point line through each quad's middle.
  it('draws a strikethrough through each quad’s middle', () => {
    expect(MarkDrawing.of({ kind: 'strikeout', quads: [SLANTED] }).strokes).toEqual([
      {
        points: [
          { x: 100, y: 708 },
          { x: 200, y: 718 },
        ],
        width: PDF_MARK_LINE_PT,
        round: false,
        closed: false,
      },
    ]);
  });

  // marks.md: a Squiggly underline is a zigzag along the foot, its teeth PDF_SQUIGGLE_STEP_PT apart and as high.
  it('draws a squiggly underline as teeth along the foot', () => {
    const short: Quad = [100, 716, 108, 716, 100, 700, 108, 700];
    const [stroke] = MarkDrawing.of({ kind: 'squiggly', quads: [short] }).strokes;
    const step = PDF_SQUIGGLE_STEP_PT;
    expect(stroke).toEqual({
      points: [
        { x: 100, y: 700 },
        { x: 100 + step, y: 700 + step },
        { x: 100 + 2 * step, y: 700 },
        { x: 100 + 3 * step, y: 700 + step },
        { x: 108, y: 700 },
      ],
      width: PDF_MARK_LINE_PT,
      round: false,
      closed: false,
    });
  });

  it('slants a squiggly underline’s teeth with its text', () => {
    const [stroke] = MarkDrawing.of({ kind: 'squiggly', quads: [SLANTED] }).strokes;
    const points = stroke!.points;
    expect(points[0]).toEqual({ x: 100, y: 700 });
    expect(points.at(-1)!.x).toBeCloseTo(200);
    expect(points.at(-1)!.y).toBeCloseTo(710);
    // A tooth stands off the foot towards the quad's top, the step high.
    const foot = (x: number) => 700 + (x - 100) / 10;
    const tooth = points[1]!;
    const off = Math.hypot(tooth.x - points[0]!.x, tooth.y - points[0]!.y);
    expect(tooth.y).toBeGreaterThan(foot(tooth.x));
    expect(off).toBeGreaterThan(PDF_SQUIGGLE_STEP_PT);
  });

  // A quad too short for one tooth, or one with no height, still draws: a tooth of its own width, standing up.
  it('draws one tooth on a quad shorter than a step', () => {
    const tiny: Quad = [100, 700, 101, 700, 100, 700, 101, 700];
    expect(MarkDrawing.of({ kind: 'squiggly', quads: [tiny] }).strokes[0]!.points).toEqual([
      { x: 100, y: 700 },
      { x: 101, y: 700 },
    ]);
    const flat: Quad = [100, 700, 104, 700, 100, 700, 104, 700];
    expect(MarkDrawing.of({ kind: 'squiggly', quads: [flat] }).strokes[0]!.points).toEqual([
      { x: 100, y: 700 },
      { x: 102, y: 702 },
      { x: 104, y: 700 },
    ]);
  });

  it('draws nothing for a quad with no width', () => {
    const point: Quad = [100, 716, 100, 716, 100, 700, 100, 700];
    expect(MarkDrawing.of({ kind: 'squiggly', quads: [point] }).strokes[0]!.points).toEqual([
      { x: 100, y: 700 },
      { x: 100, y: 700 },
    ]);
  });
});

// marks.md "Making a mark": A Drawing is its strokes, each a line through the points it passed, its ends round.
describe('a Drawing’s drawing', () => {
  it('strokes each stroke through its points, round, at its own width; one point a dot', () => {
    expect(
      MarkDrawing.of({
        kind: 'drawing',
        strokes: [
          [10, 20, 30, 40, 50, 20],
          [5, 5],
        ],
        width: 2,
      }),
    ).toEqual({
      fills: [],
      strokes: [
        {
          points: [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
            { x: 50, y: 20 },
          ],
          width: 2,
          round: true,
          closed: false,
        },
        {
          points: [
            { x: 5, y: 5 },
            { x: 5, y: 5 },
          ],
          width: 2,
          round: true,
          closed: false,
        },
      ],
    });
  });
});

// marks.md "Making a mark": a Line through its two ends; an Arrow with an open head at its end; a Rectangle its box's
// edge, closed; an Ellipse within its box, closed.
describe('a line’s and a shape’s drawing', () => {
  it('draws a Line from end to end, square-ended, at its width', () => {
    expect(MarkDrawing.of({ kind: 'line', line: [10, 20, 110, 20], width: 3 })).toEqual({
      fills: [],
      strokes: [
        {
          points: [
            { x: 10, y: 20 },
            { x: 110, y: 20 },
          ],
          width: 3,
          round: false,
          closed: false,
        },
      ],
    });
  });

  it('heads an Arrow with two lines at 30° to it, PDF_ARROW_HEAD_WIDTHS widths long', () => {
    const { strokes } = MarkDrawing.of({ kind: 'arrow', line: [10, 20, 110, 20], width: 3 });
    expect(strokes).toHaveLength(2);
    const [left, tip, right] = strokes[1]!.points;
    expect(tip).toEqual({ x: 110, y: 20 });
    const side = PDF_ARROW_HEAD_WIDTHS * 3;
    expect(left!.x).toBeCloseTo(110 - side * Math.cos(Math.PI / 6));
    expect(left!.y).toBeCloseTo(20 + side * Math.sin(Math.PI / 6));
    expect(right!.x).toBeCloseTo(110 - side * Math.cos(Math.PI / 6));
    expect(right!.y).toBeCloseTo(20 - side * Math.sin(Math.PI / 6));
    expect(strokes[1]).toMatchObject({ width: 3, round: false, closed: false });
  });

  it('keeps a thin Arrow’s head PDF_ARROW_HEAD_MIN_PT long, and heads a line of no length to its tip', () => {
    const [left, tip] = MarkDrawing.of({ kind: 'arrow', line: [10, 20, 10, 120], width: 0.5 })
      .strokes[1]!.points;
    expect(Math.hypot(tip!.x - left!.x, tip!.y - left!.y)).toBeCloseTo(PDF_ARROW_HEAD_MIN_PT);
    const still = MarkDrawing.of({ kind: 'arrow', line: [10, 20, 10, 20], width: 1 });
    expect(still.strokes[1]!.points.every((point) => point.x === 10 && point.y === 20)).toBe(true);
  });

  it('draws a Rectangle round its box, closed', () => {
    expect(MarkDrawing.of({ kind: 'rectangle', rect: [10, 20, 110, 70], width: 2 })).toEqual({
      fills: [],
      strokes: [
        {
          points: [
            { x: 10, y: 20 },
            { x: 110, y: 20 },
            { x: 110, y: 70 },
            { x: 10, y: 70 },
          ],
          width: 2,
          round: false,
          closed: true,
        },
      ],
    });
  });

  it('draws an Ellipse touching its box’s four sides, closed', () => {
    const [stroke] = MarkDrawing.of({ kind: 'ellipse', rect: [10, 20, 110, 70], width: 2 }).strokes;
    expect(stroke).toMatchObject({ width: 2, round: false, closed: true });
    const xs = stroke!.points.map((point) => point.x);
    const ys = stroke!.points.map((point) => point.y);
    expect(Math.min(...xs)).toBeCloseTo(10);
    expect(Math.max(...xs)).toBeCloseTo(110);
    expect(Math.min(...ys)).toBeCloseTo(20);
    expect(Math.max(...ys)).toBeCloseTo(70);
    for (const { x, y } of stroke!.points)
      expect(((x - 60) / 50) ** 2 + ((y - 45) / 25) ** 2).toBeCloseTo(1);
  });
});

// marks.md "Making a mark": a Callout's line runs from what is meant, an open arrowhead there, through its knee to its
// box's side; the line and the box's border are 1 point. A Text draws only its words.
describe('a Text’s and a Callout’s drawing', () => {
  it('draws nothing for a Text but its words', () => {
    expect(MarkDrawing.of({ kind: 'text', rect: [10, 20, 110, 70] })).toEqual({
      fills: [],
      strokes: [],
    });
  });

  it('draws a Callout’s line, its head at what is meant, and its box’s border', () => {
    const { fills, strokes } = MarkDrawing.of({
      kind: 'callout',
      rect: [100, 20, 200, 70],
      callout: [10, 45, 88, 45, 100, 45],
    });
    expect(fills).toEqual([]);
    expect(strokes).toHaveLength(3);
    const [line, head, border] = strokes;
    expect(line).toMatchObject({ width: PDF_MARK_LINE_PT, closed: false });
    expect(line!.points).toEqual([
      { x: 10, y: 45 },
      { x: 88, y: 45 },
      { x: 100, y: 45 },
    ]);
    // The head's sides lean back from the tip towards the knee.
    expect(head!.points[1]).toEqual({ x: 10, y: 45 });
    expect(head!.points[0]!.x).toBeGreaterThan(10);
    expect(border).toMatchObject({ width: PDF_MARK_LINE_PT, closed: true });
    expect(border!.points).toHaveLength(4);
  });
});

// marks.md "Stamps": LiveDoc's style, a rounded border round the stamp's box.
describe('a stamp’s drawing', () => {
  it('draws its border alone, as StampLayout rounds it: its words are set apart', () => {
    const stamp = { kind: 'stamp', rect: [100, 600, 220, 627], lines: ['DRAFT'] } as const;
    expect(MarkDrawing.of(stamp)).toEqual({ fills: [], strokes: [StampLayout.border(stamp)] });
  });
});

// marks.md "Changing a mark": a line style's pattern, in lengths of its line's width and never under a point; an
// Arrow's head solid; a fill inside a Rectangle's or an Ellipse's line.
describe('a line style and a fill drawn', () => {
  it('gives each style its pattern in widths, a point at the least, Solid none', () => {
    expect(MarkDrawing.pattern('solid', 2)).toEqual([]);
    expect(MarkDrawing.pattern('dashed', 2)).toEqual([6, 4]);
    expect(MarkDrawing.pattern('dotted', 2)).toEqual([2, 2]);
    expect(MarkDrawing.pattern('dash-dot', 2)).toEqual([6, 2, 2, 2]);
    expect(MarkDrawing.pattern('long-dashes', 2)).toEqual([12, 4]);
    expect(MarkDrawing.pattern('dashed', 0.5)).toEqual([3, 2]);
  });

  it('dashes a Drawing’s strokes, a Line, and a Rectangle’s and an Ellipse’s outline', () => {
    const drawing = MarkDrawing.of({
      kind: 'drawing',
      strokes: [[0, 0, 10, 10]],
      width: 2,
      lineStyle: 'dotted',
    });
    expect(drawing.strokes[0]!.dash).toEqual([2, 2]);
    const box = MarkDrawing.of({
      kind: 'ellipse',
      rect: [0, 0, 10, 10],
      width: 1,
      lineStyle: 'dashed',
    });
    expect(box.strokes[0]!.dash).toEqual([3, 2]);
  });

  it('keeps an Arrow’s head solid', () => {
    const arrow = MarkDrawing.of({
      kind: 'arrow',
      line: [0, 0, 100, 0],
      width: 2,
      lineStyle: 'long-dashes',
    });
    expect(arrow.strokes.map((stroke) => stroke.dash)).toEqual([[12, 4], undefined]);
  });

  it('leaves a solid line with no pattern, as it always drew', () => {
    const line = MarkDrawing.of({ kind: 'line', line: [0, 0, 100, 0], width: 2 });
    expect(line.strokes[0]).not.toHaveProperty('dash');
    expect(line).not.toHaveProperty('fill');
  });

  it('fills a Rectangle’s box and an Ellipse’s outline in the fill colour', () => {
    const rectangle = MarkDrawing.of({
      kind: 'rectangle',
      rect: [0, 0, 10, 20],
      width: 1,
      fill: '#fdf1a9',
    });
    expect(rectangle.fill).toEqual({
      colour: '#fdf1a9',
      points: rectangle.strokes[0]!.points,
    });
    const ellipse = MarkDrawing.of({
      kind: 'ellipse',
      rect: [0, 0, 10, 20],
      width: 1,
      fill: '#fdf1a9',
    });
    expect(ellipse.fill!.points).toBe(ellipse.strokes[0]!.points);
  });
});

// marks.md "Changing a mark": how a line end is drawn, at the second end, as big as an Arrow's head, solid.
describe('a line end drawn', () => {
  // A line 2 wide along x to (100, 0): a head's side is PDF_ARROW_HEAD_WIDTHS widths.
  const side = PDF_ARROW_HEAD_WIDTHS * 2;
  const ended = (lineEnd: LineEnd, kind: 'line' | 'arrow' = 'line') =>
    MarkDrawing.of({ kind, line: [0, 0, 100, 0], width: 2, lineEnd, lineStyle: 'dashed' });
  const span = (points: readonly { x: number; y: number }[], axis: 'x' | 'y') =>
    Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));

  it('draws a Line bare and an Arrow open-headed where they name no end', () => {
    expect(MarkDrawing.of({ kind: 'line', line: [0, 0, 100, 0], width: 2 }).strokes).toHaveLength(
      1,
    );
    const arrow = MarkDrawing.of({ kind: 'arrow', line: [0, 0, 100, 0], width: 2 });
    expect(arrow.strokes[1]).toEqual(ended('open-arrow').strokes[1]);
  });

  it('draws None as nothing, on an Arrow too', () => {
    expect(ended('none', 'arrow').strokes).toHaveLength(1);
  });

  it('closes and fills an Arrow, solid', () => {
    const { fills, strokes } = ended('arrow');
    expect(fills).toHaveLength(1);
    expect(fills[0]).toEqual(strokes[1]!.points);
    expect(strokes[1]).toMatchObject({ closed: true, width: 2 });
    expect(strokes[1]).not.toHaveProperty('dash');
  });

  it('centres a Circle, a Square and a Diamond on the end, a head’s side across', () => {
    for (const end of ['circle', 'square', 'diamond'] as const) {
      const outline = ended(end).strokes[1]!;
      expect(outline.closed).toBe(true);
      expect(span(outline.points, 'x')).toBeCloseTo(side);
      expect(span(outline.points, 'y')).toBeCloseTo(side);
      const xs = outline.points.map((p) => p.x);
      expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(100);
    }
    expect(ended('diamond').strokes[1]!.points[0]).toEqual({ x: 100 + side / 2, y: 0 });
  });

  it('draws a Bar square across the end, a head’s side long', () => {
    const [from, to] = ended('bar').strokes[1]!.points;
    expect(from!.x).toBeCloseTo(100);
    expect(to!.x).toBeCloseTo(100);
    expect(Math.abs(to!.y - from!.y)).toBeCloseTo(side);
  });

  it('stands a Bar upright on a line of no length', () => {
    const still = MarkDrawing.of({ kind: 'line', line: [5, 5, 5, 5], width: 2, lineEnd: 'bar' });
    const [from, to] = still.strokes[1]!.points;
    expect(from!.x).toBeCloseTo(5);
    expect(to!.x).toBeCloseTo(5);
    expect(Math.abs(to!.y - from!.y)).toBeCloseTo(side);
  });

  it('turns its end with its line', () => {
    const turned = MarkDrawing.of({ kind: 'line', line: [0, 0, 0, 100], width: 2, lineEnd: 'bar' });
    const [from, to] = turned.strokes[1]!.points;
    expect(from!.y).toBeCloseTo(100);
    expect(Math.abs(to!.x - from!.x)).toBeCloseTo(side);
  });
});

// marks.md "Making a mark": a Polygon closed through its corners, a Cloud's edge of arcs bulging outward, Connected
// lines open with their last end.
describe('a Polygon’s, a Cloud’s and Connected lines’ drawing', () => {
  // A square 120 points a side, drawn clockwise and anticlockwise.
  const square = [0, 0, 120, 0, 120, 120, 0, 120];
  const clockwise = [0, 0, 0, 120, 120, 120, 120, 0];

  it('closes a Polygon through its corners, its fill inside', () => {
    const drawing = MarkDrawing.of({ kind: 'polygon', corners: square, width: 2, fill: '#ffeeaa' });
    expect(drawing.strokes).toHaveLength(1);
    expect(drawing.strokes[0]).toMatchObject({ closed: true, width: 2 });
    expect(drawing.strokes[0]!.points).toEqual([
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: 120 },
    ]);
    expect(drawing.fill).toEqual({ points: drawing.strokes[0]!.points, colour: '#ffeeaa' });
  });

  it.each([
    ['anticlockwise', square],
    ['clockwise', clockwise],
  ])(
    'edges a Cloud drawn %s with whole arcs bulging outward, PDF_CLOUD_ARC_PT across',
    (_, corners) => {
      const [outline] = MarkDrawing.of({ kind: 'cloud', corners, width: 2 }).strokes;
      expect(outline!.closed).toBe(true);
      const xs = outline!.points.map((point) => point.x);
      const ys = outline!.points.map((point) => point.y);
      // Each side holds 10 arcs of 12 points: they bulge half an arc out past the square, never into it further.
      expect(Math.min(...xs)).toBeCloseTo(-PDF_CLOUD_ARC_PT / 2, 0);
      expect(Math.max(...xs)).toBeCloseTo(120 + PDF_CLOUD_ARC_PT / 2, 0);
      expect(Math.min(...ys)).toBeCloseTo(-PDF_CLOUD_ARC_PT / 2, 0);
      expect(Math.max(...ys)).toBeCloseTo(120 + PDF_CLOUD_ARC_PT / 2, 0);
      const inside = outline!.points.filter(
        (p) => p.x > 0.5 && p.x < 119.5 && p.y > 0.5 && p.y < 119.5,
      );
      expect(inside).toEqual([]);
    },
  );

  it('runs Connected lines open through their corners, their last end in its look', () => {
    const plain = MarkDrawing.of({ kind: 'polyline', corners: [0, 0, 50, 0, 50, 50], width: 2 });
    expect(plain.strokes).toHaveLength(1);
    expect(plain.strokes[0]).toMatchObject({ closed: false });
    expect(plain.strokes[0]!.points).toHaveLength(3);
    const headed = MarkDrawing.of({
      kind: 'polyline',
      corners: [0, 0, 50, 0, 50, 50],
      width: 2,
      lineEnd: 'open-arrow',
    });
    expect(headed.strokes).toHaveLength(2);
    expect(headed.strokes[1]!.points[1]).toEqual({ x: 50, y: 50 });
  });
});

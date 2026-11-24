import { describe, expect, it } from 'vitest';
import { PDF_MARK_LINE_PT, PDF_SQUIGGLE_STEP_PT } from './limits';
import type { Quad } from './mark';
import { MarkDrawing } from './mark-drawing';

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
        },
        {
          points: [
            { x: 100, y: 700 },
            { x: 200, y: 710 },
          ],
          width: PDF_MARK_LINE_PT,
          round: false,
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
        },
        {
          points: [
            { x: 5, y: 5 },
            { x: 5, y: 5 },
          ],
          width: 2,
          round: true,
        },
      ],
    });
  });
});

// docs/specs/035-pdf-documents/marks.md "In the file": a line's and a shape's appearance stream is drawn from what the
// page shows of them (MarkDrawing), line for line, in the mark's colour and opacity.
import { describe, expect, it } from 'vitest';
import { appearanceOf } from './appearance';

const look = { colour: '#d93025', opacity: 1 };

describe('appearanceOf', () => {
  it('strokes each open line through its points in the mark’s colour and width', () => {
    const drawn = appearanceOf(
      {
        fills: [],
        strokes: [
          {
            points: [
              { x: 10, y: 20 },
              { x: 110.125, y: 20 },
            ],
            width: 3,
            round: false,
            closed: false,
          },
        ],
      },
      look,
    );
    expect(drawn.content).toBe(
      ['q', '0.853 0.19 0.147 RG', '3 w 0 J 0 j', '10 20 m 110.13 20 l S', 'Q'].join('\n'),
    );
    expect(drawn.opacity).toBeNull();
  });

  it('closes a closed line and rounds a round one', () => {
    const drawn = appearanceOf(
      {
        fills: [],
        strokes: [
          {
            points: [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
              { x: 5, y: 5 },
            ],
            width: 1,
            round: false,
            closed: true,
          },
          {
            points: [
              { x: 1, y: 1 },
              { x: 2, y: 2 },
            ],
            width: 2,
            round: true,
            closed: false,
          },
        ],
      },
      look,
    );
    expect(drawn.content).toContain('1 w 0 J 0 j\n0 0 m 5 0 l 5 5 l h S');
    expect(drawn.content).toContain('2 w 1 J 1 j\n1 1 m 2 2 l S');
  });

  it('fills each closed outline', () => {
    const drawn = appearanceOf(
      {
        fills: [
          [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 4 },
          ],
        ],
        strokes: [],
      },
      look,
    );
    expect(drawn.content).toBe(
      ['q', '0.853 0.19 0.147 rg', '0 0 m 4 0 l 4 4 l h f', 'Q'].join('\n'),
    );
  });

  it('names the opacity under 1, to be drawn through a graphics state', () => {
    const dot = { points: [{ x: 1, y: 1 }], width: 1, round: true, closed: false };
    const drawn = appearanceOf({ fills: [], strokes: [dot] }, { colour: '#000000', opacity: 0.5 });
    expect(drawn.opacity).toBe(0.5);
    expect(drawn.content).toBe(
      ['q', '/LDa gs', '0.002 0.002 0.002 RG', '1 w 1 J 1 j', '1 1 m S', 'Q'].join('\n'),
    );
  });

  // The box holds every line whole: a sharp corner reaches past a point by up to its line's width.
  it('boxes every point, grown by the widest line', () => {
    const drawn = appearanceOf(
      {
        fills: [],
        strokes: [
          {
            points: [
              { x: 10, y: 20 },
              { x: 110, y: 60 },
            ],
            width: 4,
            round: false,
            closed: false,
          },
        ],
      },
      look,
    );
    expect(drawn.box).toEqual([6, 16, 114, 64]);
  });
});

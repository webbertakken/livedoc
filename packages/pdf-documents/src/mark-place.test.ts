import { describe, expect, it } from 'vitest';
import { PageName } from './page-name';
import { Mark, type Box, type Quad } from './mark';
import { MarkPlace } from './mark-place';

const BASE = {
  page: PageName.parse('p:1')!,
  colour: '#ff0000',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
};
const QUAD: Quad = [100, 716, 200, 716, 100, 700, 200, 700];
const PAGE: Box = [0, 0, 612, 792];

const highlight = Mark.highlight({ ...BASE, id: 'h', quads: [QUAD], text: 'x' })!;
const drawing = Mark.drawing({ ...BASE, id: 'd', strokes: [[10, 10, 20, 30]], width: 2 })!;
const line = Mark.line('arrow', { ...BASE, id: 'l', line: [10, 10, 50, 60], width: 2 })!;
const box = Mark.shape('ellipse', { ...BASE, id: 'e', rect: [100, 100, 200, 150], width: 2 })!;
const text = Mark.text({ ...BASE, id: 't', rect: [300, 300, 400, 330], words: 'Hi', size: 12 })!;
const callout = Mark.callout({
  ...BASE,
  id: 'c',
  rect: [300, 300, 400, 330],
  words: 'Hi',
  size: 12,
  callout: [250, 250, 288, 315, 300, 315],
})!;
const stamp = Mark.stamp({
  ...BASE,
  id: 's',
  rect: [10, 700, 110, 740],
  stamp: 'approved',
  lines: ['APPROVED'],
})!;

describe('MarkPlace', () => {
  // marks.md "Changing a mark": a text mark is not moved; it is changed by selecting other text.
  it('moves no text mark', () => {
    expect(MarkPlace.moved(highlight, { x: 5, y: 5 })).toBeNull();
    expect(MarkPlace.isMovable(highlight)).toBe(false);
    expect(MarkPlace.isMovable(drawing)).toBe(true);
  });

  // marks.md "Changing a mark": a drag moves the mark, its whole geometry, by the same amount.
  it('moves each kind’s geometry by the offset', () => {
    const by = { x: 5, y: -10 };
    expect(MarkPlace.moved(drawing, by)).toEqual({ strokes: [[15, 0, 25, 20]] });
    expect(MarkPlace.moved(line, by)).toEqual({ line: [15, 0, 55, 50] });
    expect(MarkPlace.moved(box, by)).toEqual({ rect: [105, 90, 205, 140] });
    expect(MarkPlace.moved(text, by)).toEqual({ rect: [305, 290, 405, 320] });
    expect(MarkPlace.moved(stamp, by)).toEqual({ rect: [15, 690, 115, 730] });
    expect(MarkPlace.moved(callout, by)).toEqual({
      rect: [305, 290, 405, 320],
      callout: [255, 240, 293, 305, 305, 305],
    });
  });

  // A moved mark is still a mark: its geometry reads back through Mark.parse.
  it('answers geometry a mark holds', () => {
    const moved = MarkPlace.moved(callout, { x: 1, y: 1 })!;
    expect(Mark.parse({ ...callout, ...moved })).toEqual({ ...callout, ...moved });
  });

  // marks.md "Changing a mark": the marks are held on their page.
  it('holds an offset so the marks stay on their page', () => {
    // The drawing spans x 10 to 20, y 10 to 30; the stamp x 10 to 110, y 700 to 740.
    expect(MarkPlace.held([drawing], { x: -50, y: -50 }, PAGE)).toEqual({ x: -10, y: -10 });
    expect(MarkPlace.held([drawing, stamp], { x: 600, y: 100 }, PAGE)).toEqual({ x: 502, y: 52 });
    expect(MarkPlace.held([drawing], { x: 3, y: 4 }, PAGE)).toEqual({ x: 3, y: 4 });
  });

  // A mark already past the page's edge may come back, never go further.
  it('lets a mark past the edge come back, never further', () => {
    const off = Mark.shape('rectangle', { ...BASE, id: 'o', rect: [-20, 10, 30, 20], width: 1 })!;
    expect(MarkPlace.held([off], { x: -5, y: 0 }, PAGE)).toEqual({ x: 0, y: 0 });
    expect(MarkPlace.held([off], { x: 8, y: 0 }, PAGE)).toEqual({ x: 8, y: 0 });
  });

  // Text marks are not moved, so they hold nothing back.
  it('answers the offset whole for no movable mark', () => {
    expect(MarkPlace.held([highlight], { x: 999, y: 0 }, PAGE)).toEqual({ x: 999, y: 0 });
  });
});

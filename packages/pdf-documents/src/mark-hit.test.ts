import { describe, expect, it } from 'vitest';
import { PageName } from './page-name';
import { Mark, type Quad } from './mark';
import { MarkHit } from './mark-hit';

const BASE = {
  page: PageName.parse('p:1')!,
  colour: '#ff0000',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
};
// A line of text 16 points high and 100 wide, its foot at y 700.
const QUAD: Quad = [100, 716, 200, 716, 100, 700, 200, 700];
const REACH = 4;

const underline = Mark.ofText('underline', { ...BASE, id: 'u', quads: [QUAD], text: 'x' })!;
const drawing = Mark.drawing({
  ...BASE,
  id: 'd',
  strokes: [
    [10, 10, 50, 10],
    [80, 80],
  ],
  width: 2,
})!;
const rectangle = Mark.shape('rectangle', {
  ...BASE,
  id: 'r',
  rect: [100, 100, 200, 200],
  width: 2,
})!;
const ellipse = Mark.shape('ellipse', { ...BASE, id: 'e', rect: [300, 100, 400, 200], width: 2 })!;
const text = Mark.text({ ...BASE, id: 't', rect: [300, 300, 400, 330], words: 'Hi', size: 12 })!;
const callout = Mark.callout({
  ...BASE,
  id: 'c',
  rect: [300, 400, 400, 430],
  words: 'Hi',
  size: 12,
  callout: [200, 350, 288, 415, 300, 415],
})!;
const stamp = Mark.stamp({
  ...BASE,
  id: 's',
  rect: [10, 700, 110, 740],
  stamp: 'approved',
  lines: ['APPROVED'],
})!;
const ALL = [underline, drawing, rectangle, ellipse, text, callout, stamp];

const at = (x: number, y: number) => MarkHit.at(ALL, { x, y }, REACH)?.id ?? null;

describe('MarkHit', () => {
  // marks.md "Changing a mark": what a press reaches, a text mark its glyphs.
  it('reaches a text mark by its glyphs, not past them', () => {
    expect(at(150, 708)).toBe('u');
    expect(at(150, 720)).toBeNull();
  });

  // A Drawing's line, within the reach and half its width; a one-point stroke as a dot.
  it('reaches a line within reach of it', () => {
    expect(at(30, 10 + 1 + REACH)).toBe('d');
    expect(at(30, 10 + 1 + REACH + 0.5)).toBeNull();
    expect(at(82, 82)).toBe('d');
  });

  // A box drawn round a paragraph leaves its text to select.
  it('reaches a rectangle and an ellipse by their line alone', () => {
    expect(at(100, 150)).toBe('r');
    expect(at(150, 150)).toBeNull();
    expect(at(400, 150)).toBe('e');
    expect(at(350, 150)).toBeNull();
  });

  // A Text's, a Callout's and a stamp's box; a Callout's line as a line's.
  it('reaches a box anywhere within it, and a callout by its line', () => {
    expect(at(350, 315)).toBe('t');
    expect(at(350, 415)).toBe('c');
    expect(at(244, 382.5)).toBe('c');
    expect(at(60, 720)).toBe('s');
  });

  // Where marks overlap, the one drawn last, on top.
  it('takes the mark drawn last where marks overlap', () => {
    const over = Mark.stamp({ ...stamp, id: 'z' })!;
    expect(MarkHit.at([stamp, over], { x: 60, y: 720 }, REACH)?.id).toBe('z');
    expect(MarkHit.at([over, stamp], { x: 60, y: 720 }, REACH)?.id).toBe('s');
  });
});

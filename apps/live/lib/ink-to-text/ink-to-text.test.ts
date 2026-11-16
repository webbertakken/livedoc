import { describe, expect, it } from 'vitest';
import { packFreehandPoints, type Element, type FreehandElement } from '@livedoc/document';
import { inkBox, inkPolylines, inkTextElement, inkTextSize, replaceInk } from './ink-to-text';
import { inkSelection } from './ink-selection';

// docs/specs/023-draw-mode/ink-to-text.md

function stroke(
  id: string,
  x: number,
  y: number,
  over: Partial<FreehandElement> = {},
): FreehandElement {
  return {
    id,
    type: 'freehand',
    closed: false,
    ...packFreehandPoints([
      { x, y },
      { x: x + 40, y: y + 20 },
    ]),
    ...over,
  };
}

const box = (id: string): Element => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
});

describe('inkSelection', () => {
  const a = stroke('a', 0, 0);
  const b = stroke('b', 60, 0);

  it('is the selected pen strokes, in the tab’s order', () => {
    const els = [b, box('s'), a];
    expect(inkSelection(els, new Set(['a', 'b']), new Set())?.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('is nothing for an empty selection, or one holding anything but pen strokes', () => {
    expect(inkSelection([a], new Set(), new Set())).toBeNull();
    expect(inkSelection([a, box('s')], new Set(['a', 's']), new Set())).toBeNull();
    expect(inkSelection([a], new Set(['gone']), new Set())).toBeNull();
  });

  it('is nothing with a highlighter, a locked stroke or one on a locked layer', () => {
    const marker = stroke('m', 0, 0, { pen: 'highlighter' });
    const locked = stroke('l', 0, 0, { locked: true });
    expect(inkSelection([a, marker], new Set(['a', 'm']), new Set())).toBeNull();
    expect(inkSelection([a, locked], new Set(['a', 'l']), new Set())).toBeNull();
    expect(inkSelection([a], new Set(['a']), new Set(['a']))).toBeNull();
  });
});

describe('the ink’s box and picture', () => {
  const ink = [stroke('a', 10, 20), stroke('b', 110, 40)];

  it('spans every stroke', () => {
    // Each stroke's box is padded a pixel round its points.
    expect(inkBox(ink)).toEqual({ x: 9, y: 19, width: 142, height: 42 });
  });

  it('draws the strokes scaled into a picture at most 1024 px long, at least 64 px high, with a margin', () => {
    const pic = inkPolylines(ink);
    expect(pic.width).toBeLessThanOrEqual(1024);
    expect(pic.height).toBeGreaterThanOrEqual(64);
    expect(pic.lines).toHaveLength(2);
    for (const line of pic.lines)
      for (const p of line) {
        expect(p.x).toBeGreaterThanOrEqual(pic.margin);
        expect(p.x).toBeLessThanOrEqual(pic.width - pic.margin);
        expect(p.y).toBeGreaterThanOrEqual(pic.margin);
        expect(p.y).toBeLessThanOrEqual(pic.height - pic.margin);
      }
    expect(pic.lineWidth).toBeGreaterThan(0);
  });

  it('keeps a long line within 1024 px', () => {
    const long = [stroke('a', 0, 0), stroke('b', 5000, 10)];
    const pic = inkPolylines(long);
    expect(pic.width).toBe(1024);
  });

  it('draws a single dot without dividing by nothing', () => {
    const dot = {
      ...stroke('d', 0, 0),
      ...packFreehandPoints([
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ]),
    } as FreehandElement;
    const pic = inkPolylines([dot]);
    expect(Number.isFinite(pic.lines[0]![0]!.x)).toBe(true);
  });
});

describe('the text it becomes', () => {
  it('is as big as the writing: height over lines, times 0.75, whole px, within 12 and 160', () => {
    expect(inkTextSize(40, 1)).toBe(30);
    expect(inkTextSize(100, 2)).toBe(38);
    expect(inkTextSize(4, 1)).toBe(12);
    expect(inkTextSize(1000, 1)).toBe(160);
  });

  it('sits in the ink’s box, in Caveat, in the ink’s colour, on its layer', () => {
    const ink = [stroke('a', 10, 20, { penColour: 'blue', layerId: 'L' }), stroke('b', 110, 40)];
    const text = inkTextElement(ink, 'Order placed\nby phone', 't1');
    expect(text).toMatchObject({
      id: 't1',
      type: 'text',
      x: 9,
      y: 19,
      width: 142,
      height: 42,
      label: 'Order placed\nby phone',
      font: 'caveat',
      textAlignX: 'left',
      textSize: 16,
      penTextColour: 'blue',
      layerId: 'L',
    });
  });

  it('carries a custom ink colour as the text’s colour', () => {
    const text = inkTextElement([stroke('a', 0, 0, { strokeColor: '#ff0000' })], 'Hi', 't');
    expect(text.textColor).toBe('#ff0000');
    expect(text.penTextColour).toBeUndefined();
    expect(text.layerId).toBeUndefined();
  });
});

describe('replaceInk', () => {
  it('takes the strokes out and puts the text at the first stroke’s place, in one map', () => {
    const els = [box('x'), stroke('a', 0, 0), box('y'), stroke('b', 0, 0)];
    const text = inkTextElement([els[1] as FreehandElement], 'Hi', 't');
    expect(replaceInk(els, new Set(['a', 'b']), text).map((e) => e.id)).toEqual(['x', 't', 'y']);
  });
});

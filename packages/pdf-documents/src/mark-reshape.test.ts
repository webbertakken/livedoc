import { describe, expect, it } from 'vitest';
import { PDF_TEXT_PADDING_PT } from './limits';
import { Mark, type Quad } from './mark';
import { MarkReshape } from './mark-reshape';
import { PageName } from './page-name';
import { TypedLayout } from './typed-layout';

const BASE = {
  page: PageName.parse('p:1')!,
  colour: '#ff0000',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
};
const QUAD: Quad = [100, 716, 200, 716, 100, 700, 200, 700];
const highlight = Mark.highlight({ ...BASE, id: 'h', quads: [QUAD], text: 'x' })!;
const drawing = Mark.drawing({ ...BASE, id: 'd', strokes: [[10, 10, 20, 30]], width: 2 })!;
const arrow = Mark.line('arrow', { ...BASE, id: 'l', line: [10, 10, 50, 60], width: 2 })!;
const ellipse = Mark.shape('ellipse', { ...BASE, id: 'e', rect: [100, 100, 200, 150], width: 2 })!;
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

const BOX = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

describe('MarkReshape', () => {
  // marks.md "Changing a mark": Handles.
  it('gives each kind its handles, a text mark none', () => {
    expect(MarkReshape.handles(highlight)).toEqual([]);
    expect(MarkReshape.handles(arrow)).toEqual(['start', 'end']);
    expect(MarkReshape.handles(ellipse)).toEqual(BOX);
    expect(MarkReshape.handles(drawing)).toEqual(BOX);
    expect(MarkReshape.handles(stamp)).toEqual(BOX);
    expect(MarkReshape.handles(callout)).toEqual([...BOX, 'tip', 'knee']);
  });

  it('answers the box a box handle sizes: a rect, or a Drawing’s bounds; none for a line', () => {
    expect(MarkReshape.box(ellipse)).toEqual([100, 100, 200, 150]);
    expect(MarkReshape.box(callout)).toEqual([300, 300, 400, 330]);
    expect(MarkReshape.box(drawing)).toEqual([10, 10, 20, 30]);
    expect(MarkReshape.box(arrow)).toBeNull();
    expect(MarkReshape.box(highlight)).toBeNull();
  });

  // "What a box's new size does": lines stretch with it, their width kept.
  it('stretches a shape, a stamp and a Drawing into the new box', () => {
    expect(MarkReshape.reboxed(ellipse, [100, 100, 300, 200])).toEqual({
      rect: [100, 100, 300, 200],
    });
    expect(MarkReshape.reboxed(stamp, [0, 600, 200, 700])).toEqual({ rect: [0, 600, 200, 700] });
    expect(MarkReshape.reboxed(drawing, [10, 10, 30, 70])).toEqual({ strokes: [[10, 10, 30, 70]] });
    expect(MarkReshape.reboxed(arrow, [0, 0, 1, 1])).toBeNull();
  });

  it('stretches a Drawing with no width or height along the other way alone', () => {
    const flat = Mark.drawing({ ...BASE, id: 'f', strokes: [[10, 10, 30, 10]], width: 2 })!;
    expect(MarkReshape.reboxed(flat, [10, 5, 50, 5])).toEqual({ strokes: [[10, 5, 50, 5]] });
  });

  // A Text's words wrap at the new width; its box is never lower than its words, growing down.
  it('keeps a Text at least one character wide and as high as its words', () => {
    const narrow = MarkReshape.reboxed(text, [300, 320, 301, 330]) as { rect: readonly number[] };
    const least = 12 + 2 * PDF_TEXT_PADDING_PT;
    expect(narrow.rect[2]! - narrow.rect[0]!).toBe(least);
    const lines = TypedLayout.lines('Hi', 12, least).length;
    expect(narrow.rect[3]).toBe(330);
    expect(narrow.rect[3]! - narrow.rect[1]!).toBeCloseTo(TypedLayout.height(lines, 12), 9);
    expect(MarkReshape.reboxed(text, [300, 200, 500, 330])).toEqual({ rect: [300, 200, 500, 330] });
  });

  // A Callout's line runs again to the side facing its tip.
  it('runs a Callout’s line again to its new box', () => {
    expect(MarkReshape.reboxed(callout, [320, 280, 420, 330])).toEqual({
      rect: [320, 280, 420, 330],
      callout: TypedLayout.calloutLine({ x: 250, y: 250 }, [320, 280, 420, 330]),
    });
  });

  // marks.md "Changing a mark": what a new size does.
  describe('sized', () => {
    const PAGE = [0, 0, 612, 792] as const;

    it('wraps the words again at the box’s width, growing down and never shrinking', () => {
      const long = Mark.text({
        ...BASE,
        id: 'w',
        rect: [300, 300, 360, 330],
        words: 'Hello there',
        size: 10,
      })!;
      const larger = MarkReshape.sized(long, 24, PAGE) as { rect: readonly number[] };
      const lines = TypedLayout.lines('Hello there', 24, 60).length;
      expect(larger.rect[0]).toBe(300);
      expect(larger.rect[2]).toBe(360);
      expect(larger.rect[3]).toBe(330);
      expect(larger.rect[3]! - larger.rect[1]!).toBeCloseTo(TypedLayout.height(lines, 24), 9);
      expect(MarkReshape.sized(long, 4, PAGE)).toEqual({ rect: [300, 300, 360, 330] });
    });

    it('widens a box to one character at the least', () => {
      const thin = Mark.text({
        ...BASE,
        id: 'n',
        rect: [300, 300, 310, 330],
        words: 'H',
        size: 4,
      })!;
      const sized = MarkReshape.sized(thin, 40, PAGE) as { rect: readonly number[] };
      expect(sized.rect[2]! - sized.rect[0]!).toBe(40 + 2 * PDF_TEXT_PADDING_PT);
    });

    it('moves a box that would grow past the page’s foot up onto it', () => {
      const low = Mark.text({
        ...BASE,
        id: 'f',
        rect: [300, 2, 400, 32],
        words: 'Hello there you',
        size: 12,
      })!;
      const sized = MarkReshape.sized(low, 48, PAGE) as { rect: readonly number[] };
      expect(sized.rect[1]).toBe(0);
      expect(sized.rect[3]! - sized.rect[1]!).toBeGreaterThan(30);
    });

    it('runs a Callout’s line again to the side facing its tip', () => {
      const sized = MarkReshape.sized(callout, 30, PAGE) as {
        rect: readonly [number, number, number, number];
        callout: readonly number[];
      };
      expect(sized.callout).toEqual(TypedLayout.calloutLine({ x: 250, y: 250 }, sized.rect));
    });
  });

  // A line's end, a Callout's tip and knee.
  it('places and moves a point handle', () => {
    expect(MarkReshape.at(arrow, 'start')).toEqual({ x: 10, y: 10 });
    expect(MarkReshape.at(arrow, 'end')).toEqual({ x: 50, y: 60 });
    expect(MarkReshape.at(callout, 'tip')).toEqual({ x: 250, y: 250 });
    expect(MarkReshape.at(callout, 'knee')).toEqual({ x: 288, y: 315 });
    expect(MarkReshape.at(ellipse, 'nw')).toBeNull();
    expect(MarkReshape.pointed(arrow, 'start', { x: 0, y: 5 })).toEqual({ line: [0, 5, 50, 60] });
    expect(MarkReshape.pointed(arrow, 'end', { x: 70, y: 80 })).toEqual({ line: [10, 10, 70, 80] });
    expect(MarkReshape.pointed(callout, 'tip', { x: 500, y: 250 })).toEqual({
      rect: callout.rect,
      callout: TypedLayout.calloutLine({ x: 500, y: 250 }, callout.rect),
    });
    expect(MarkReshape.pointed(callout, 'knee', { x: 280, y: 330 })).toEqual({
      rect: callout.rect,
      callout: [250, 250, 280, 330, 300, 315],
    });
    expect(MarkReshape.pointed(ellipse, 'tip', { x: 1, y: 1 })).toBeNull();
    expect(MarkReshape.pointed(arrow, 'tip', { x: 1, y: 1 })).toBeNull();
  });
});

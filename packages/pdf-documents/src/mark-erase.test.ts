import { describe, expect, it } from 'vitest';
import { Mark, type DrawingMark } from './mark';
import { MarkErase } from './mark-erase';
import { PageName } from './page-name';

// marks.md "Changing a mark": Erase rubs out the strokes of a Drawing it passes over, whole strokes at a time, within a
// reach of a stroke's line, half its width added; a Drawing with no strokes left is deleted.
const drawing = (strokes: number[][], width = 2): DrawingMark =>
  Mark.drawing({
    id: 'd',
    page: PageName.ofObject(3),
    strokes,
    width,
    colour: '#ff0000',
    opacity: 1,
    author: 'Ada',
    createdAt: 1,
  })!;

const ACROSS = [0, 0, 100, 0];
const UP = [200, 0, 200, 100];
const DOT = [300, 300, 300, 300];
const at = (x: number, y: number) => ({ x, y });

describe('MarkErase.passed', () => {
  it('names the strokes a drag comes within reach of, its width’s half added', () => {
    const mark = drawing([ACROSS, UP, DOT]);
    expect(MarkErase.passed(mark, [at(50, 5)], 4)).toEqual([0]);
    expect(MarkErase.passed(mark, [at(50, 5.5)], 4)).toEqual([]);
    expect(MarkErase.passed(mark, [at(301, 301)], 4)).toEqual([2]);
  });

  it('catches a stroke a fast drag crosses between two of its points', () => {
    const mark = drawing([ACROSS, UP]);
    expect(MarkErase.passed(mark, [at(50, -40), at(50, 40)], 1)).toEqual([0]);
    expect(MarkErase.passed(mark, [at(150, 50), at(250, 50)], 1)).toEqual([1]);
    expect(MarkErase.passed(mark, [at(150, 50), at(190, 50)], 1)).toEqual([]);
  });

  it('names none for an empty drag', () => {
    expect(MarkErase.passed(drawing([ACROSS]), [], 4)).toEqual([]);
  });
});

describe('MarkErase.without', () => {
  it('leaves the other strokes, in order', () => {
    expect(MarkErase.without(drawing([ACROSS, UP, DOT]), [0, 2])).toEqual({ strokes: [UP] });
  });

  it('is nothing once no stroke is left: the Drawing is deleted', () => {
    expect(MarkErase.without(drawing([ACROSS, UP]), [1, 0])).toBeNull();
  });
});

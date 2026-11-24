import { describe, expect, it } from 'vitest';
import {
  PDF_DRAWING_MAX_POINTS,
  PDF_MARK_MAX_QUADS,
  PDF_MARK_TEXT_MAX_CHARS,
  PDF_MARK_WIDTH_MAX_PT,
  PDF_MARK_WIDTH_MIN_PT,
} from './limits';
import { Mark, type DrawingInput, type HighlightInput, type Quad } from './mark';

const QUAD: Quad = [72, 716, 300, 716, 72, 700, 300, 700];
const input = (over: Partial<HighlightInput> = {}): HighlightInput => ({
  id: 'mark-1',
  page: 'p:4',
  quads: [QUAD],
  text: 'Trace-based compilation',
  colour: '#fdf1a9',
  opacity: 1,
  author: 'Ada',
  createdAt: 1_795_000_000_000,
  ...over,
});

describe('Mark', () => {
  it('makes a highlight over the quads given', () => {
    expect(Mark.highlight(input())).toEqual({
      ...input(),
      kind: 'highlight',
      modifiedAt: 1_795_000_000_000,
    });
  });

  it('reads back what it made, unchanged', () => {
    const mark = Mark.highlight(input());
    expect(Mark.parse(JSON.parse(JSON.stringify(mark)))).toEqual(mark);
  });

  it('measures the rectangle that holds every quad', () => {
    const mark = Mark.highlight(input({ quads: [QUAD, [72, 698, 180, 698, 72, 682, 180, 682]] }))!;
    expect(Mark.bounds(mark)).toEqual([72, 682, 300, 716]);
  });

  it('cuts text and a name past their limits rather than refusing the mark', () => {
    const mark = Mark.highlight(
      input({ text: 'x'.repeat(PDF_MARK_TEXT_MAX_CHARS + 5), author: 'n'.repeat(300) }),
    )!;
    expect(mark.text).toHaveLength(PDF_MARK_TEXT_MAX_CHARS);
    expect(mark.author).toHaveLength(255);
  });

  it.each([
    ['no value', null],
    ['a string', 'highlight'],
    ['an id with a space', { id: 'a b' }],
    ['an unknown kind', { kind: 'laser' }],
    ['a page that is no name', { page: 'page 4' }],
    ['no quads', { quads: [] }],
    ['quads that are no list', { quads: 'all' }],
    ['a quad of seven numbers', { quads: [[1, 2, 3, 4, 5, 6, 7]] }],
    ['a quad that is not finite', { quads: [[1, 2, 3, 4, 5, 6, 7, Number.NaN]] }],
    ['a quad far off any page', { quads: [[1e9, 2, 3, 4, 5, 6, 7, 8]] }],
    [
      'more quads than one mark holds',
      { quads: Array.from({ length: PDF_MARK_MAX_QUADS + 1 }, () => QUAD) },
    ],
    ['text that is no string', { text: 7 }],
    ['an author that is no string', { author: null }],
    ['a colour that is no hex', { colour: 'yellow' }],
    ['an opacity under a tenth', { opacity: 0.05 }],
    ['an opacity over one', { opacity: 1.5 }],
    ['an opacity that is no number', { opacity: '1' }],
    ['a time that is no whole number', { createdAt: 1.5 }],
    ['a time before the epoch', { modifiedAt: -1 }],
  ])('refuses %s', (_name, over) => {
    const value =
      over === null || typeof over === 'string' ? over : { ...Mark.highlight(input()), ...over };
    expect(Mark.parse(value)).toBeNull();
  });
});

// marks.md "Making a mark": A Drawing, its strokes checked and bounded as every mark's geometry is.
describe('a Drawing', () => {
  const drawing = (over: Record<string, unknown> = {}) => ({
    id: 'd1',
    page: 'p:4',
    strokes: [
      [100, 600, 150, 650],
      [10, 10],
    ],
    width: 2,
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
    ...over,
  });

  it('is made of its strokes, read back unchanged, bounded by every point', () => {
    const mark = Mark.drawing(drawing() as unknown as DrawingInput)!;
    expect(mark).toEqual({ ...drawing(), kind: 'drawing', modifiedAt: 1_795_000_000_000 });
    expect(Mark.parse(JSON.parse(JSON.stringify(mark)))).toEqual(mark);
    expect(Mark.bounds(mark)).toEqual([10, 10, 150, 650]);
    expect(Mark.points(mark)).toBe(3);
    expect(Mark.isText(mark)).toBe(false);
  });

  it.each([
    ['no strokes', { strokes: [] }],
    ['strokes that are no list', { strokes: 'all' }],
    ['a stroke of one number', { strokes: [[1]] }],
    ['a stroke of an odd count', { strokes: [[1, 2, 3]] }],
    ['a point far off any page', { strokes: [[1e9, 2]] }],
    ['a point that is not finite', { strokes: [[Number.NaN, 2]] }],
    [
      'more points than one Drawing holds',
      { strokes: [Array.from({ length: (PDF_DRAWING_MAX_POINTS + 1) * 2 }, () => 1)] },
    ],
    ['no width', { width: undefined }],
    ['a width too thin', { width: PDF_MARK_WIDTH_MIN_PT / 2 }],
    ['a width too wide', { width: PDF_MARK_WIDTH_MAX_PT + 1 }],
    ['an author that is no string', { author: 7 }],
  ])('refuses %s', (_, over) => {
    expect(Mark.parse({ ...drawing(over), kind: 'drawing', modifiedAt: 0 })).toBeNull();
  });
});

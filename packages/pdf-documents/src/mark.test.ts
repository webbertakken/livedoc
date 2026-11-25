import { describe, expect, it } from 'vitest';
import {
  PDF_DRAWING_MAX_POINTS,
  PDF_MARK_MAX_QUADS,
  PDF_MARK_TEXT_MAX_CHARS,
  PDF_MARK_WIDTH_MAX_PT,
  PDF_MARK_WIDTH_MIN_PT,
  PDF_STAMP_LINE_MAX_CHARS,
  PDF_TEXT_SIZE_MAX_PT,
  PDF_TEXT_SIZE_MIN_PT,
} from './limits';
import {
  LINE_ENDS,
  LINE_STYLES,
  TEXT_ALIGNS,
  Mark,
  type DrawingInput,
  type HighlightInput,
  type LineInput,
  type Quad,
  type CalloutInput,
  type ShapeInput,
  type StampInput,
  type TextBoxInput,
} from './mark';

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

  it('carries its author key, read back; a key not of the form reads as none', () => {
    const key = 'k-ada';
    const mark = Mark.highlight({ ...input(), ...Mark.keyed(key) })!;
    expect(mark.authorKey).toBe(key);
    expect(Mark.parse(JSON.parse(JSON.stringify(mark)))).toEqual(mark);
    for (const bad of ['', 'a b', 'k'.repeat(65), 7])
      expect(Mark.parse({ ...mark, authorKey: bad })).not.toHaveProperty('authorKey');
    expect(Mark.keyed(null)).toEqual({});
  });

  it('is own to the key it carries alone; no key owns nothing', () => {
    const mine = Mark.highlight({ ...input(), ...Mark.keyed('k1') })!;
    const none = Mark.highlight(input())!;
    expect(Mark.isOwn(mine, 'k1')).toBe(true);
    expect(Mark.isOwn(mine, 'k2')).toBe(false);
    expect(Mark.isOwn(mine, null)).toBe(false);
    expect(Mark.isOwn(none, null)).toBe(false);
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

  it.each(['o:12', 'a1b2c3d4-e5f6.7', '{5F3C9A1E-0B2D-4E8F-9A7C-1D2E3F4A5B6C}'])(
    'holds a file mark’s own id, %s',
    (id) => {
      expect(Mark.parse({ ...Mark.highlight(input()), id })?.id).toBe(id);
    },
  );

  it.each([
    ['no value', null],
    ['a string', 'highlight'],
    ['an id with a space', { id: 'a b' }],
    ['an id with a quote', { id: 'a"b' }],
    ['an id longer than an id holds', { id: 'x'.repeat(65) }],
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

// marks.md "Making a mark": a Line or an Arrow is its two ends; a Rectangle or an Ellipse the box a drag spans.
describe('a line or a shape', () => {
  const base = {
    id: 's1',
    page: 'p:4',
    width: 2,
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
  };
  const line = (over: Record<string, unknown> = {}) => ({
    ...base,
    line: [100, 600, 200, 650],
    ...over,
  });
  const shape = (over: Record<string, unknown> = {}) => ({
    ...base,
    rect: [100, 600, 200, 650],
    ...over,
  });

  it.each(['line', 'arrow'] as const)('makes a %s of its two ends, read back unchanged', (kind) => {
    const mark = Mark.line(kind, line() as unknown as LineInput)!;
    expect(mark).toEqual({ ...line(), kind, modifiedAt: base.createdAt });
    expect(Mark.parse(JSON.parse(JSON.stringify(mark)))).toEqual(mark);
    expect(
      Mark.bounds(Mark.line(kind, line({ line: [200, 650, 100, 600] }) as unknown as LineInput)!),
    ).toEqual([100, 600, 200, 650]);
    expect(Mark.isText(mark)).toBe(false);
  });

  it.each(['rectangle', 'ellipse'] as const)(
    'makes a %s of its box, read back unchanged',
    (kind) => {
      const mark = Mark.shape(kind, shape() as unknown as ShapeInput)!;
      expect(mark).toEqual({ ...shape(), kind, modifiedAt: base.createdAt });
      expect(Mark.parse(JSON.parse(JSON.stringify(mark)))).toEqual(mark);
      expect(Mark.bounds(mark)).toEqual([100, 600, 200, 650]);
    },
  );

  it.each([
    ['no ends', { line: undefined }],
    ['three numbers', { line: [1, 2, 3] }],
    ['an end far off any page', { line: [1e9, 2, 3, 4] }],
    ['a width too wide', { width: PDF_MARK_WIDTH_MAX_PT + 1 }],
  ])('refuses a line of %s', (_, over) => {
    expect(Mark.parse({ ...line(over), kind: 'arrow', modifiedAt: 0 })).toBeNull();
  });

  it.each([
    ['no box', { rect: undefined }],
    ['a box of five numbers', { rect: [1, 2, 3, 4, 5] }],
    ['a box turned inside out', { rect: [200, 600, 100, 650] }],
    ['a box upside down', { rect: [100, 650, 200, 600] }],
    ['a box that is not finite', { rect: [100, 600, Number.NaN, 650] }],
    ['a width too thin', { width: PDF_MARK_WIDTH_MIN_PT / 2 }],
  ])('refuses a shape of %s', (_, over) => {
    expect(Mark.parse({ ...shape(over), kind: 'ellipse', modifiedAt: 0 })).toBeNull();
  });
});

// marks.md "Kinds": a Text and a Callout are words typed straight onto the page, in a box; a Callout's line points.
describe('a Text or a Callout', () => {
  const text = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    page: 'p:4',
    rect: [100, 600, 200, 650],
    words: 'Check this figure',
    size: 12,
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
    ...over,
  });
  const CALLOUT = [40, 500, 88, 625, 100, 625] as const;

  it('makes a Text of its box and words, read back unchanged', () => {
    const mark = Mark.text(text() as unknown as TextBoxInput)!;
    expect(mark).toEqual({ ...text(), kind: 'text', modifiedAt: text().createdAt });
    expect(Mark.parse(JSON.parse(JSON.stringify(mark)))).toEqual(mark);
    expect(Mark.bounds(mark)).toEqual([100, 600, 200, 650]);
    expect(Mark.isTyped(mark)).toBe(true);
    expect(Mark.isText(mark)).toBe(false);
  });

  it('makes a Callout whose bounds take in its line', () => {
    const mark = Mark.callout(text({ callout: CALLOUT }) as unknown as CalloutInput)!;
    expect(mark.kind).toBe('callout');
    expect(mark.callout).toEqual(CALLOUT);
    expect(Mark.parse(JSON.parse(JSON.stringify(mark)))).toEqual(mark);
    expect(Mark.bounds(mark)).toEqual([40, 500, 200, 650]);
  });

  // marks.md "Changing a mark": Format > Align text; until one is chosen, the words' own.
  it('holds an alignment once chosen, and none until then', () => {
    for (const align of TEXT_ALIGNS) {
      const mark = Mark.text(text({ align }) as unknown as TextBoxInput)!;
      expect(mark.align).toBe(align);
      expect(Mark.parse(JSON.parse(JSON.stringify(mark)))).toEqual(mark);
    }
    expect(Mark.text(text({ align: null }) as unknown as TextBoxInput)).not.toHaveProperty('align');
    expect(Mark.parse({ ...text({ align: 'middle' }), kind: 'text', modifiedAt: 0 })).toBeNull();
  });

  // marks.md "Changing a mark": the selected Texts' and Callouts' font.
  it('holds a font of the Font menu, in its own spelling, and none for any other', () => {
    const mark = Mark.text(text({ font: 'lora' }) as unknown as TextBoxInput)!;
    expect(mark.font).toBe('Lora');
    expect(Mark.parse(JSON.parse(JSON.stringify(mark)))).toEqual(mark);
    for (const font of [null, 'Arial', 7])
      expect(Mark.text(text({ font }) as unknown as TextBoxInput)).not.toHaveProperty('font');
  });

  it('cuts words past their limit rather than refusing the mark', () => {
    const long = 'w'.repeat(PDF_MARK_TEXT_MAX_CHARS + 5);
    expect(Mark.text(text({ words: long }) as unknown as TextBoxInput)!.words).toHaveLength(
      PDF_MARK_TEXT_MAX_CHARS,
    );
  });

  it.each([
    ['no words', { words: '' }],
    ['only spaces', { words: '  \n ' }],
    ['words that are no string', { words: 42 }],
    ['a size too small', { size: PDF_TEXT_SIZE_MIN_PT / 2 }],
    ['a size too large', { size: PDF_TEXT_SIZE_MAX_PT + 1 }],
    ['no box', { rect: undefined }],
    ['a box turned inside out', { rect: [200, 600, 100, 650] }],
    ['a box upside down', { rect: [100, 650, 200, 600] }],
  ])('refuses a Text of %s', (_, over) => {
    expect(Mark.parse({ ...text(over), kind: 'text', modifiedAt: 0 })).toBeNull();
  });

  it.each([
    ['no line', {}],
    ['a line of four numbers', { callout: [1, 2, 3, 4] }],
    ['a line far off any page', { callout: [1e9, 2, 3, 4, 5, 6] }],
  ])('refuses a Callout of %s', (_, over) => {
    expect(Mark.parse({ ...text(over), kind: 'callout', modifiedAt: 0 })).toBeNull();
  });
});

// marks.md "Stamps": a stamp is ready-made words in a box, fixed when placed.
describe('a stamp', () => {
  const stamp = (over: Record<string, unknown> = {}) => ({
    id: 's1',
    page: 'p:4',
    rect: [100, 600, 220, 637],
    stamp: 'approved-by',
    lines: ['APPROVED', 'by Ada Lovelace, 21 Nov 2026, 14:02'],
    colour: '#086f1e',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
    ...over,
  });

  it('makes a stamp of its box and lines, read back unchanged, bounded by its box', () => {
    const mark = Mark.stamp(stamp() as unknown as StampInput)!;
    expect(mark).toEqual({ ...stamp(), kind: 'stamp', modifiedAt: stamp().createdAt });
    expect(Mark.parse(JSON.parse(JSON.stringify(mark)))).toEqual(mark);
    expect(Mark.bounds(mark)).toEqual([100, 600, 220, 637]);
    expect(Mark.isTyped(mark)).toBe(false);
  });

  it('takes a stamp LiveDoc does not draw, so a person’s own fits', () => {
    expect(
      Mark.stamp(stamp({ stamp: 'my-own-7', lines: ['PAID'] }) as unknown as StampInput),
    ).not.toBeNull();
  });

  it.each([
    ['no lines', { lines: [] }],
    ['three lines', { lines: ['A', 'B', 'C'] }],
    ['a line of only spaces', { lines: ['APPROVED', '  '] }],
    ['a line that is no string', { lines: [7] }],
    ['lines that are no list', { lines: 'APPROVED' }],
    ['a line past its limit', { lines: ['A'.repeat(PDF_STAMP_LINE_MAX_CHARS + 1)] }],
    ['no stamp', { stamp: undefined }],
    ['a stamp id out of bounds', { stamp: 'Approved by me' }],
    ['no box', { rect: undefined }],
    ['a box with no width', { rect: [100, 600, 100, 637] }],
    ['a box with no height', { rect: [100, 600, 220, 600] }],
  ])('refuses a stamp of %s', (_, over) => {
    expect(Mark.parse({ ...stamp(over), kind: 'stamp', modifiedAt: 0 })).toBeNull();
  });

  it('keeps a line at its limit', () => {
    const line = 'A'.repeat(PDF_STAMP_LINE_MAX_CHARS);
    expect(Mark.stamp(stamp({ lines: [line] }) as unknown as StampInput)!.lines).toEqual([line]);
  });
});

// marks.md "Changing a mark": a line's style (Format > Line style) and a Rectangle's or an Ellipse's fill.
describe('a line style and a fill', () => {
  const base = {
    id: 'm1',
    page: 'p:4',
    width: 2,
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
    modifiedAt: 1_795_000_000_000,
  };
  const marks = {
    drawing: { ...base, kind: 'drawing', strokes: [[1, 2, 3, 4]] },
    line: { ...base, kind: 'line', line: [1, 2, 3, 4] },
    arrow: { ...base, kind: 'arrow', line: [1, 2, 3, 4] },
    rectangle: { ...base, kind: 'rectangle', rect: [1, 2, 3, 4] },
    ellipse: { ...base, kind: 'ellipse', rect: [1, 2, 3, 4] },
  };

  it.each(Object.entries(marks))('reads back a %s’s line style', (_, mark) => {
    for (const lineStyle of LINE_STYLES.filter((style) => style !== 'solid'))
      expect(Mark.parse({ ...mark, lineStyle })).toEqual({ ...mark, lineStyle });
  });

  it('holds Solid as no style at all, so a solid line reads as one always did', () => {
    expect(Mark.parse({ ...marks.line, lineStyle: 'solid' })).toEqual(marks.line);
    expect(Mark.parse({ ...marks.line, lineStyle: null })).toEqual(marks.line);
  });

  it('refuses a style it does not know', () => {
    expect(Mark.parse({ ...marks.line, lineStyle: 'wavy' })).toBeNull();
  });

  it.each(['rectangle', 'ellipse'] as const)(
    'reads back a %s’s fill; none where it is null',
    (kind) => {
      expect(Mark.parse({ ...marks[kind], fill: '#fdf1a9' })).toEqual({
        ...marks[kind],
        fill: '#fdf1a9',
      });
      expect(Mark.parse({ ...marks[kind], fill: null })).toEqual(marks[kind]);
      expect(Mark.parse({ ...marks[kind], fill: 'yellow' })).toBeNull();
    },
  );

  it('keeps no style or fill on a kind that has none', () => {
    const highlight = { ...base, kind: 'highlight', quads: [QUAD], text: 'x' };
    delete (highlight as Record<string, unknown>).width;
    expect(Mark.parse({ ...highlight, lineStyle: 'dashed', fill: '#fdf1a9' })).toEqual(highlight);
    expect(Mark.parse({ ...marks.line, fill: '#fdf1a9' })).toEqual(marks.line);
  });
});

// marks.md "Changing a mark": a Line's and an Arrow's second end (Format > Line ends).
describe('a line end', () => {
  const base = {
    id: 'm1',
    page: 'p:4',
    width: 2,
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
    modifiedAt: 1_795_000_000_000,
    line: [1, 2, 3, 4],
  };

  it('reads back every end on a Line and an Arrow', () => {
    for (const kind of ['line', 'arrow'] as const)
      for (const lineEnd of LINE_ENDS.filter((end) => end !== Mark.firstEnd(kind)))
        expect(Mark.parse({ ...base, kind, lineEnd })).toEqual({ ...base, kind, lineEnd });
  });

  it('holds a kind’s own end as none at all, so a Line and an Arrow read as they always did', () => {
    expect(Mark.firstEnd('line')).toBe('none');
    expect(Mark.firstEnd('arrow')).toBe('open-arrow');
    expect(Mark.parse({ ...base, kind: 'line', lineEnd: 'none' })).toEqual({
      ...base,
      kind: 'line',
    });
    expect(Mark.parse({ ...base, kind: 'arrow', lineEnd: 'open-arrow' })).toEqual({
      ...base,
      kind: 'arrow',
    });
    expect(Mark.parse({ ...base, kind: 'arrow', lineEnd: null })).toEqual({
      ...base,
      kind: 'arrow',
    });
  });

  it('refuses an end it does not know', () => {
    expect(Mark.parse({ ...base, kind: 'line', lineEnd: 'slash' })).toBeNull();
  });
});

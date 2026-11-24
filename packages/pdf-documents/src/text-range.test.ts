// docs/specs/035-pdf-documents/reading-surface.md "The pages": Selecting text and Copy, on a page's text as the reader
// hands it over (generated spaces and line breaks with boxes of no size, a hyphen broken at a line's end as \u0002).
import { describe, expect, it } from 'vitest';
import { PageText } from './page-text';
import { TextRange } from './text-range';

type Line = { text: string; x: number; y: number; height?: number; width?: number };

// A page of lines, each character `width` wide and `height` tall from its line's bottom `y`; a space is generated
// (a box of no size), and lines are joined by a generated \r\n, as the engine's reader writes them.
function pageOf(lines: readonly Line[]): PageText {
  const codes: number[] = [];
  const boxes: number[] = [];
  const point = (x: number, y: number) => boxes.push(x, y, x, y);
  lines.forEach((line, at) => {
    const { width = 6, height = 8 } = line;
    let x = line.x;
    for (const character of line.text) {
      codes.push(character.codePointAt(0)!);
      if (character === ' ') point(x, line.y);
      else boxes.push(x, line.y, x + width, line.y + height);
      x += width;
    }
    if (at < lines.length - 1) {
      codes.push(13, 10);
      point(x, line.y);
      point(x, line.y);
    }
  });
  return PageText.of(codes, boxes);
}

const slice = (page: PageText, [start, end]: readonly [number, number]) =>
  page.text.slice(start, end);

describe('a caret place on a page', () => {
  const page = pageOf([
    { text: 'Hello world', x: 100, y: 700 },
    { text: 'Second line', x: 100, y: 680 },
  ]);

  it('falls before a character pressed left of its middle, after it right of its middle', () => {
    // "H" spans 100 to 106.
    expect(TextRange.caretAt(page, { x: 101, y: 704 })).toBe(0);
    expect(TextRange.caretAt(page, { x: 105, y: 704 })).toBe(1);
  });

  it('picks the line beside the point first, then its nearest character', () => {
    // Far right of the first line, at its height: after "d", not on the line below.
    expect(TextRange.caretAt(page, { x: 400, y: 703 })).toBe(11);
    // Left of the second line's start.
    expect(TextRange.caretAt(page, { x: 20, y: 684 })).toBe(13);
    // Above every line: the nearest line is the first.
    expect(TextRange.caretAt(page, { x: 101, y: 790 })).toBe(0);
  });

  it('has no place on a page with no characters to pick', () => {
    expect(TextRange.caretAt(PageText.of([], []), { x: 1, y: 1 })).toBeNull();
    expect(TextRange.caretAt(PageText.of([32], [5, 5, 5, 5]), { x: 1, y: 1 })).toBeNull();
  });

  it('names the character nearest a point, for a word or a line pressed', () => {
    expect(TextRange.nearest(page, { x: 105, y: 704 })).toBe(0);
    expect(TextRange.nearest(page, { x: 400, y: 683 })).toBe(23);
    expect(TextRange.nearest(PageText.of([], []), { x: 1, y: 1 })).toBeNull();
  });

  it('has no place for a point that is not a number', () => {
    expect(TextRange.caretAt(page, { x: Number.NaN, y: 700 })).toBeNull();
  });
});

describe('a word, a line and all of a page', () => {
  const page = pageOf([
    { text: 'Hello, wörld 42', x: 100, y: 700 },
    { text: 'com\u0002', x: 100, y: 680 },
  ]);
  // The reader writes the broken word without a break: "com\u0002pile".
  const broken = PageText.of(
    [...'com\u0002pile x'].map((c) => c.codePointAt(0)!),
    [...Array.from({ length: 10 }, (_, at) => [at * 6, 0, at * 6 + 6, 8]).flat()],
  );

  it('selects a run of letters, marks and digits around the character pressed', () => {
    expect(slice(page, TextRange.word(page, 1))).toBe('Hello');
    expect(slice(page, TextRange.word(page, 9))).toBe('wörld');
    expect(slice(page, TextRange.word(page, 14))).toBe('42');
    expect(slice(broken, TextRange.word(broken, 1))).toBe('com\u0002pile');
  });

  it('selects the character itself where it is no part of a word', () => {
    expect(slice(page, TextRange.word(page, 5))).toBe(',');
    expect(TextRange.word(page, 99)).toEqual([99, 99]);
  });

  it('selects the line between two of the file’s breaks', () => {
    expect(slice(page, TextRange.line(page, 3))).toBe('Hello, wörld 42');
    expect(slice(page, TextRange.line(page, 18))).toBe('com\u0002');
  });

  it('selects every character of the page', () => {
    expect(TextRange.all(page)).toEqual([0, page.text.length]);
  });
});

describe('a column', () => {
  const page = pageOf([
    { text: 'aaaa bbbb', x: 100, y: 700 },
    { text: 'cccc dddd', x: 100, y: 680 },
  ]);

  it('takes the characters whose middles lie in the rectangle, a run a line', () => {
    // From the middle of each line's second word, both lines down.
    const spans = TextRange.column(page, { x: 129, y: 712 }, { x: 160, y: 679 });
    expect(spans.map((span) => slice(page, span))).toEqual(['bbbb', 'dddd']);
    expect(TextRange.copied(page, spans)).toBe('bbbb\ndddd');
  });

  it('takes nothing from a rectangle over no character', () => {
    expect(TextRange.column(page, { x: 0, y: 0 }, { x: 10, y: 10 })).toEqual([]);
  });
});

describe('the rectangles a selection is drawn with', () => {
  const page = pageOf([
    { text: 'ab cd', x: 100, y: 700 },
    { text: 'ef', x: 100, y: 680 },
  ]);

  it('draws one rectangle a line, as a quad upper left, upper right, lower left, lower right', () => {
    expect(TextRange.quads(page, [TextRange.all(page)])).toEqual([
      [100, 708, 130, 708, 100, 700, 130, 700],
      [100, 688, 112, 688, 100, 680, 112, 680],
    ]);
  });

  it('starts another rectangle where a character leaves the line’s height', () => {
    // A superscript and the text after it, on one line with no break.
    const shifted = PageText.of([97, 98], [0, 0, 6, 8, 6, 20, 12, 28]);
    expect(TextRange.quads(shifted, [[0, 2]])).toHaveLength(2);
  });

  it('draws nothing for nothing selected', () => {
    expect(TextRange.quads(page, [[2, 2]])).toEqual([]);
    expect(TextRange.quads(page, [])).toEqual([]);
  });
});

describe('the text a selection copies', () => {
  it('joins the lines of a paragraph with a space and keeps a short line’s break', () => {
    const page = pageOf([
      { text: 'Heading', x: 100, y: 740 },
      { text: 'The first line runs', x: 100, y: 700 },
      { text: 'all the way, then', x: 100, y: 689 },
      { text: 'it ends.', x: 100, y: 678 },
      { text: 'Next one.', x: 100, y: 667 },
    ]);
    expect(TextRange.copied(page, [TextRange.all(page)])).toBe(
      'Heading\nThe first line runs all the way, then it ends.\nNext one.',
    );
  });

  it('measures a full line against its neighbours, so a column beside it does not matter', () => {
    // The left column's lines, then the right column's, which are longer and start at the top again.
    const page = pageOf([
      { text: 'Left one runs', x: 100, y: 700 },
      { text: 'left two runs', x: 100, y: 689 },
      { text: 'Right column runs a long way', x: 300, y: 700 },
      { text: 'right column runs a long way', x: 300, y: 689 },
    ]);
    expect(TextRange.copied(page, [TextRange.all(page)])).toBe(
      'Left one runs left two runs\nRight column runs a long way right column runs a long way',
    );
  });

  it('keeps a break before a line far below, as a paragraph’s gap', () => {
    const page = pageOf([
      { text: 'One full line here', x: 100, y: 700 },
      { text: 'Another', x: 100, y: 660 },
    ]);
    expect(TextRange.copied(page, [TextRange.all(page)])).toBe('One full line here\nAnother');
  });

  it('drops a break inside one line, as a superscript makes', () => {
    const page = pageOf([
      { text: 'Eich*', x: 100, y: 703 },
      { text: ', Mike', x: 130, y: 700 },
    ]);
    expect(TextRange.copied(page, [TextRange.all(page)])).toBe('Eich*, Mike');
  });

  it('makes a word broken with a hyphen at a line’s end one word again', () => {
    const broken = PageText.of(
      [...'com\u0002pile'].map((c) => c.codePointAt(0)!),
      [...Array.from({ length: 8 }, (_, at) => [at * 6, 0, at * 6 + 6, 8]).flat()],
    );
    expect(TextRange.copied(broken, [[0, 8]])).toBe('compile');
  });

  it('keeps a break around a line with no characters to measure', () => {
    const page = pageOf([
      { text: 'One full line here', x: 100, y: 700 },
      { text: ' ', x: 100, y: 690 },
      { text: 'Two', x: 100, y: 680 },
    ]);
    expect(TextRange.copied(page, [TextRange.all(page)])).toBe('One full line here\n \nTwo');
  });

  it('copies part of a line as it is', () => {
    const page = pageOf([{ text: 'Hello world', x: 100, y: 700 }]);
    expect(TextRange.copied(page, [[6, 11]])).toBe('world');
    expect(TextRange.copied(page, [])).toBe('');
  });
});

describe('a selection between two caret places', () => {
  it('runs from the lesser to the greater, either way dragged', () => {
    expect(TextRange.between(7, 2)).toEqual([2, 7]);
    expect(TextRange.between(2, 7)).toEqual([2, 7]);
  });
});

// accessibility.md "The accessible tree": reading order rebuilt is the page's text in the file's order, joined into
// paragraphs exactly as Copy joins a whole page; past PDF_TREE_MAX_NODES_A_PAGE the rest joins the last paragraph.
describe('a page’s paragraphs', () => {
  it('reads the page as Copy joins it, one paragraph a part, none empty', () => {
    const page = pageOf([
      { text: 'Heading', x: 100, y: 740 },
      { text: 'The first line runs', x: 100, y: 700 },
      { text: 'all the way, then', x: 100, y: 689 },
      { text: 'it ends.', x: 100, y: 678 },
      { text: ' ', x: 100, y: 600 },
      { text: 'Next one.', x: 100, y: 560 },
    ]);
    expect(TextRange.paragraphs(page)).toEqual([
      'Heading',
      'The first line runs all the way, then it ends.',
      'Next one.',
    ]);
  });

  it('joins the rest into the last paragraph past the most a page holds', () => {
    const page = pageOf([
      { text: 'One', x: 100, y: 740 },
      { text: 'Two', x: 100, y: 700 },
      { text: 'Three', x: 100, y: 660 },
    ]);
    expect(TextRange.paragraphs(page, 2)).toEqual(['One', 'Two Three']);
  });

  it('has none on a page with no text', () => {
    expect(TextRange.paragraphs(PageText.of([], []))).toEqual([]);
  });
});

// "Phone and tablet": a double tap zooms to the column under the finger, read by geometry.
describe('the column under a point', () => {
  // A heading across two columns, then the columns row by row as many files write them: 8 tall, 11 apart.
  const left = (row: number, text = 'l'.repeat(30)) => ({ text, x: 100, y: 700 - row * 11 });
  const right = (row: number, text = 'r'.repeat(30)) => ({ text, x: 320, y: 700 - row * 11 });
  const page = pageOf([
    { text: 'H'.repeat(66), x: 100, y: 716 },
    left(0),
    right(0),
    left(1),
    right(1),
    left(2, 'l'.repeat(25)),
    right(2, 'r'.repeat(10)),
    // A paragraph far below: more than two line heights from the columns.
    { text: 'Far below', x: 320, y: 600 },
  ]);

  it('is the lines that run on from the one under the point, never the column beside it', () => {
    expect(TextRange.columnAt(page, { x: 400, y: 693 })).toEqual({
      left: 320,
      right: 500,
      bottom: 678,
      top: 708,
    });
  });

  it('takes a heading above it into its height, never into its width', () => {
    // Rights 496 (the heading), 280, 280 and 250: the larger middle is 280.
    expect(TextRange.columnAt(page, { x: 150, y: 682 })).toEqual({
      left: 100,
      right: 280,
      bottom: 678,
      top: 724,
    });
  });

  it('is as wide as its full lines from a short line', () => {
    expect(TextRange.columnAt(page, { x: 330, y: 680 })?.right).toBe(500);
  });

  it('takes an indented first line and the lines after it', () => {
    const indented = pageOf([
      { text: 'Indented start', x: 112, y: 700 },
      { text: 'a'.repeat(30), x: 100, y: 689 },
    ]);
    expect(TextRange.columnAt(indented, { x: 120, y: 703 })).toEqual({
      left: 100,
      right: 280,
      bottom: 689,
      top: 708,
    });
  });

  it('is found from a point in the space between two lines', () => {
    expect(TextRange.columnAt(page, { x: 400, y: 699 })?.left).toBe(320);
  });

  it('is none where no line lies within a line height of the point', () => {
    expect(TextRange.columnAt(page, { x: 400, y: 640 })).toBeNull();
    expect(TextRange.columnAt(page, { x: 700, y: 693 })).toBeNull();
    expect(TextRange.columnAt(PageText.of([], []), { x: 1, y: 1 })).toBeNull();
    expect(TextRange.columnAt(page, { x: Number.NaN, y: 1 })).toBeNull();
  });
});

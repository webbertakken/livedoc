// docs/specs/035-pdf-documents/marks.md "Changing a mark": the selected marks' colour, Reset to each kind's first look
// (a stamp its own), Format > Opacity and Line width (a width only where a mark has a line), each one step under the
// person's own origin.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  LINE_ENDS,
  LINE_STYLES,
  Mark,
  MarkReshape,
  PageName,
  PdfLiveChanges,
  TEXT_ALIGNS,
  type Quad,
} from '@livedoc/pdf-documents';
import { FIRST_LOOKS } from './pdf-mark-looks';
import {
  ALIGN_ITEMS,
  alignOf,
  END_ITEMS,
  fillOf,
  firstColour,
  lineEndOf,
  lineStyleOf,
  OPACITY_ITEMS,
  restyleMarks,
  sharedOf,
  sizedLook,
  sizeOf,
  STYLE_ITEMS,
  WIDTH_ITEMS,
  widthOf,
} from './pdf-mark-restyle';
import { STAMP_COLOURS } from './pdf-stamp';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';
import { PDF_MENUS } from './pdf-menus';
import { catalogueItems } from '@/lib/office/office-catalogue';

const page = PageName.ofObject(4);
const T = 1_795_000_000_000;
const BASE = { page, colour: '#ff0000', opacity: 1, author: 'Ada', createdAt: T };
const QUAD: Quad = [100, 716, 200, 716, 100, 700, 200, 700];

const line = Mark.line('arrow', { ...BASE, id: 'l', line: [10, 10, 50, 60], width: 2 })!;
const stamp = Mark.stamp({
  ...BASE,
  id: 's',
  rect: [10, 700, 110, 740],
  stamp: 'approved',
  lines: ['APPROVED'],
})!;
const custom = { ...stamp, id: 'c', stamp: 'my-own' };
const highlight = Mark.highlight({ ...BASE, id: 'h', quads: [QUAD], text: 'x' })!;

function withMarks() {
  const doc = PdfLiveChanges.load();
  for (const mark of [line, stamp, highlight]) PdfLiveChanges.addMark(doc, mark);
  const origins: unknown[] = [];
  doc.on('afterTransaction', (transaction: Y.Transaction) => origins.push(transaction.origin));
  return { doc, origins };
}

describe('the Format menu steps', () => {
  it('names an item of Opacity and of Line width for each step, each a value in its range', () => {
    const ids = new Set(catalogueItems(PDF_MENUS).map(({ item }) => item.id));
    for (const id of [...Object.keys(OPACITY_ITEMS), ...Object.keys(WIDTH_ITEMS)])
      expect(ids.has(id)).toBe(true);
    expect(Object.values(OPACITY_ITEMS)).toEqual([1, 0.75, 0.5, 0.25, 0.1]);
    expect(Object.values(WIDTH_ITEMS)).toEqual([0.5, 1, 2, 4, 8, 12]);
  });
});

describe('firstColour', () => {
  it('gives a kind its first look, a stamp its own, and a stamp LiveDoc does not draw the colour it has', () => {
    expect(firstColour(highlight)).toBe(FIRST_LOOKS.highlight.colour);
    expect(firstColour(line)).toBe(FIRST_LOOKS.arrow.colour);
    expect(firstColour(stamp)).toBe(STAMP_COLOURS.green);
    expect(firstColour(custom)).toBe('#ff0000');
  });
});

describe('sharedOf', () => {
  it('answers the value every mark holds, null where they differ or none holds one', () => {
    expect(sharedOf([line, stamp], (mark) => mark.colour)).toBe('#ff0000');
    expect(sharedOf([line, { ...stamp, colour: '#00ff00' }], (mark) => mark.colour)).toBeNull();
    expect(sharedOf([line, highlight], widthOf)).toBe(2);
    expect(sharedOf([highlight], widthOf)).toBeNull();
    expect(sharedOf([], (mark) => mark.colour)).toBeNull();
  });
});

describe('restyleMarks', () => {
  it('gives every mark named its new look as one change under the person’s origin', () => {
    const { doc, origins } = withMarks();
    const changed = restyleMarks(doc, ['l', 'h', 'gone'], () => ({ colour: '#00AA00' }), T + 1);
    expect(changed).toBe(2);
    expect(PdfLiveChanges.mark(doc, 'l')).toMatchObject({ colour: '#00aa00', modifiedAt: T + 1 });
    expect(PdfLiveChanges.mark(doc, 'h')).toMatchObject({ colour: '#00aa00' });
    expect(PdfLiveChanges.mark(doc, 's')).toMatchObject({ colour: '#ff0000' });
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('gives a width only to a mark with a line, and changes nothing a mark holds already', () => {
    const { doc, origins } = withMarks();
    expect(restyleMarks(doc, ['l', 'h'], () => ({ width: 8 }), T + 1)).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'l')).toMatchObject({ width: 8 });
    expect(PdfLiveChanges.mark(doc, 'h')).not.toHaveProperty('width');
    expect(restyleMarks(doc, ['l', 'h'], () => ({ opacity: 1 }), T + 2)).toBe(0);
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('takes each mark’s own look where it is asked for: Reset', () => {
    const { doc } = withMarks();
    expect(restyleMarks(doc, ['l', 's'], (mark) => ({ colour: firstColour(mark) }), T + 1)).toBe(2);
    expect(PdfLiveChanges.mark(doc, 's')).toMatchObject({ colour: STAMP_COLOURS.green });
    expect(PdfLiveChanges.mark(doc, 'l')).toMatchObject({ colour: FIRST_LOOKS.arrow.colour });
  });
});

// marks.md "Changing a mark": Format > Line style reaches every mark drawn as a line; the fill a Rectangle or an Ellipse.
describe('a line style and a fill restyled', () => {
  const box = Mark.shape('rectangle', { ...BASE, id: 'r', rect: [10, 10, 50, 60], width: 2 })!;

  it('names an item for each line style, each a style a mark holds', () => {
    const ids = new Set(catalogueItems(PDF_MENUS).map(({ item }) => item.id));
    for (const id of Object.keys(STYLE_ITEMS)) expect(ids.has(id)).toBe(true);
    expect(Object.values(STYLE_ITEMS)).toEqual([...LINE_STYLES]);
  });

  it('reads a style where a mark has a line, Solid where it has none of its own; a fill where it may have one', () => {
    expect(lineStyleOf(line)).toBe('solid');
    expect(lineStyleOf({ ...line, lineStyle: 'dotted' })).toBe('dotted');
    expect(lineStyleOf(highlight)).toBeUndefined();
    expect(fillOf(box)).toBeNull();
    expect(fillOf({ ...box, fill: '#fdf1a9' })).toBe('#fdf1a9');
    expect(fillOf(line)).toBeUndefined();
  });

  it('gives a style to the marks with a line alone, and Solid back as none', () => {
    const { doc } = withMarks();
    expect(restyleMarks(doc, ['l', 'h'], () => ({ lineStyle: 'dashed' }), T + 1)).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'l')).toMatchObject({ lineStyle: 'dashed' });
    expect(restyleMarks(doc, ['l'], () => ({ lineStyle: 'dashed' }), T + 2)).toBe(0);
    expect(restyleMarks(doc, ['l'], () => ({ lineStyle: 'solid' }), T + 3)).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'l')).not.toHaveProperty('lineStyle');
    expect(restyleMarks(doc, ['l'], () => ({ lineStyle: 'solid' }), T + 4)).toBe(0);
  });

  it('fills a Rectangle alone, and takes a fill away with none', () => {
    const { doc } = withMarks();
    PdfLiveChanges.addMark(doc, box);
    expect(restyleMarks(doc, ['r', 'l'], () => ({ fill: '#FDF1A9' }), T + 1)).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'r')).toMatchObject({ fill: '#fdf1a9' });
    expect(restyleMarks(doc, ['r'], () => ({ fill: null }), T + 2)).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'r')).not.toHaveProperty('fill');
    expect(restyleMarks(doc, ['r'], () => ({ fill: null }), T + 3)).toBe(0);
  });
});

// marks.md "Changing a mark": Format > Line ends reaches a Line's and an Arrow's second end alone.
describe('a line end restyled', () => {
  it('names an item for each end, each an end a mark holds', () => {
    const ids = new Set(catalogueItems(PDF_MENUS).map(({ item }) => item.id));
    for (const id of Object.keys(END_ITEMS)) expect(ids.has(id)).toBe(true);
    expect(Object.values(END_ITEMS)).toEqual([...LINE_ENDS]);
  });

  it('reads an Arrow’s open head and a Line’s bare end where they name none', () => {
    expect(lineEndOf(line)).toBe('open-arrow');
    expect(lineEndOf({ ...line, kind: 'line' })).toBe('none');
    expect(lineEndOf({ ...line, lineEnd: 'bar' })).toBe('bar');
    expect(lineEndOf(highlight)).toBeUndefined();
  });

  it('gives an end to a Line or an Arrow alone, and the kind’s own back as none', () => {
    const { doc } = withMarks();
    expect(restyleMarks(doc, ['l', 'h'], () => ({ lineEnd: 'diamond' }), T + 1)).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'l')).toMatchObject({ lineEnd: 'diamond' });
    expect(restyleMarks(doc, ['l'], () => ({ lineEnd: 'open-arrow' }), T + 2)).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'l')).not.toHaveProperty('lineEnd');
    expect(restyleMarks(doc, ['l'], () => ({ lineEnd: 'open-arrow' }), T + 3)).toBe(0);
  });
});

// marks.md "Changing a mark": the toolbar's Font size and Format > Align text reach the selected Texts and Callouts.
describe('a Text’s and a Callout’s size and alignment restyled', () => {
  const PAGE = [0, 0, 612, 792] as const;
  const text = Mark.text({
    ...BASE,
    id: 't',
    rect: [300, 300, 360, 330],
    words: 'Hello there',
    size: 10,
  })!;
  const callout = Mark.callout({
    ...BASE,
    id: 'k',
    rect: [300, 400, 400, 430],
    words: 'Hi',
    size: 12,
    callout: [250, 350, 288, 415, 300, 415],
  })!;
  const withTyped = () => {
    const made = withMarks();
    PdfLiveChanges.addMark(made.doc, text);
    PdfLiveChanges.addMark(made.doc, callout);
    return made;
  };

  it('names an item for each alignment, each one a mark holds', () => {
    const ids = new Set(catalogueItems(PDF_MENUS).map(({ item }) => item.id));
    for (const id of Object.keys(ALIGN_ITEMS)) expect(ids.has(id)).toBe(true);
    expect(Object.values(ALIGN_ITEMS)).toEqual([...TEXT_ALIGNS]);
  });

  it('reads a size and an alignment of a Text or a Callout alone, the words’ own until one is chosen', () => {
    expect(sizeOf(text)).toBe(10);
    expect(sizeOf(line)).toBeUndefined();
    expect(alignOf(text)).toBe('left');
    expect(alignOf({ ...text, words: 'שלום' })).toBe('right');
    expect(alignOf({ ...text, words: 'Hello\nשלום' })).toBeNull();
    expect(alignOf({ ...text, align: 'justified' })).toBe('justified');
    expect(alignOf(line)).toBeUndefined();
  });

  it('gives a size to the Texts and Callouts alone, their boxes and lines with it', () => {
    const { doc, origins } = withTyped();
    const before = origins.length;
    expect(restyleMarks(doc, ['t', 'k', 'l'], sizedLook(24, PAGE), T + 1)).toBe(2);
    const grown = PdfLiveChanges.mark(doc, 't')!;
    expect(grown).toMatchObject({ size: 24, ...MarkReshape.sized(text, 24, PAGE) });
    expect(PdfLiveChanges.mark(doc, 'k')).toMatchObject({
      size: 24,
      ...MarkReshape.sized(callout, 24, PAGE),
    });
    expect(PdfLiveChanges.mark(doc, 'l')).not.toHaveProperty('size');
    expect(restyleMarks(doc, ['t'], sizedLook(24, PAGE), T + 2)).toBe(0);
    expect(origins.slice(before)).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('gives an alignment to the Texts and Callouts alone, nothing where it is held', () => {
    const { doc } = withTyped();
    expect(restyleMarks(doc, ['t', 'l'], () => ({ align: 'centre' }), T + 1)).toBe(1);
    expect(PdfLiveChanges.mark(doc, 't')).toMatchObject({ align: 'centre' });
    expect(PdfLiveChanges.mark(doc, 'l')).not.toHaveProperty('align');
    expect(restyleMarks(doc, ['t'], () => ({ align: 'centre' }), T + 2)).toBe(0);
  });
});

// docs/specs/035-pdf-documents/marks.md "Making a mark": a press opens a box PDF_TEXT_BOX_WIDTH_PT wide that narrows
// to its longest line; a drag opens a box as wide as the drag and at least as high; a Callout's box hangs from its top
// right where what is meant lies to the right; a box is moved onto its page; nothing but spaces makes no mark; the
// first look; "Limits": PDF_MAX_MARKS; live-editing-and-storage.md "The layout".
import { describe, expect, it } from 'vitest';
import { standardColours, type BlobKey } from '@livedoc/document';
import {
  PageName,
  PDF_CALLOUT_KNEE_PT,
  PDF_MAX_MARKS,
  PDF_TEXT_BOX_WIDTH_PT,
  PDF_TEXT_PADDING_PT,
  PdfLiveChanges,
  TYPED_LINE_HEIGHT,
  type Box,
} from '@livedoc/pdf-documents';
import {
  addTyped,
  openByDrag,
  openByPress,
  pageBoxOf,
  TYPED_LOOK,
  TYPED_SIZE_PT,
  typedBox,
  typedOf,
  type Typed,
} from './pdf-typed';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

const stored = { blob: 'ab'.repeat(32) as BlobKey, pages: 2 };
const page = PageName.ofObject(4);
const T = 1_795_000_000_000;
const by = (id: string) => ({ author: 'Ada', now: T, id, look: TYPED_LOOK });
const LETTER: Box = [0, 0, 612, 792];
// One line at 10 points: the room inside the box and a line's height.
const ONE_LINE = 2 * PDF_TEXT_PADDING_PT + TYPED_LINE_HEIGHT * 10;
const THREE_LINES = 2 * PDF_TEXT_PADDING_PT + 3 * TYPED_LINE_HEIGHT * 10;
// "Hello" at 10 points is 22.78 wide; the box narrows to the next whole point.
const HELLO_BOX = Math.ceil(22.78 + 2 * PDF_TEXT_PADDING_PT);

describe('the first look of a Text or a Callout', () => {
  it('is the strong Red for light paper, opaque, at 12 points', () => {
    const red = standardColours('strong', 'light').find((colour) => colour.name === 'red')!.hex;
    expect(TYPED_LOOK).toEqual({ colour: red, opacity: 1 });
    expect(TYPED_SIZE_PT).toBe(12);
  });
});

describe('pageBoxOf', () => {
  it('spans the page as the file has it, however the view turns it', () => {
    expect(pageBoxOf([1, 0, 0, -1, 0, 792], { width: 612, height: 792 })).toEqual(LETTER);
    // A quarter turn: the view is the page on its side.
    expect(pageBoxOf([0, 1, 1, 0, 0, 0], { width: 792, height: 612 })).toEqual(LETTER);
  });

  it('spans nothing for a view that cannot be turned back to the page, where no press lands either', () => {
    expect(pageBoxOf([0, 0, 0, 0, 0, 0], { width: 10, height: 10 })).toEqual([
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
    ]);
  });
});

describe('a box opened by a press', () => {
  it('hangs from the press, PDF_TEXT_BOX_WIDTH_PT wide while typed in, then narrows to its words', () => {
    const opening = openByPress('text', { x: 100, y: 700 }, LETTER);
    expect(typedBox(opening, 'Hello', 10, LETTER, false)).toEqual([
      100,
      700 - ONE_LINE,
      100 + PDF_TEXT_BOX_WIDTH_PT,
      700,
    ]);
    expect(typedBox(opening, 'Hello', 10, LETTER, true)).toEqual([
      100,
      700 - ONE_LINE,
      100 + HELLO_BOX,
      700,
    ]);
  });

  it('is no wider than the page, and moved onto it at its side and its foot', () => {
    const narrow: Box = [0, 0, 150, 200];
    const opening = openByPress('text', { x: 120, y: 5 }, narrow);
    expect(opening.width).toBe(150);
    expect(typedBox(opening, 'Hi', 10, narrow, false)).toEqual([0, 0, 150, ONE_LINE]);
  });

  it('never narrows past one character and the room inside it', () => {
    const opening = openByPress('text', { x: 100, y: 700 }, LETTER);
    expect(typedBox(opening, 'i', 10, LETTER, true)[2]).toBe(100 + 10 + 2 * PDF_TEXT_PADDING_PT);
  });

  it('keeps a page’s top: a box taller than the page starts at it', () => {
    const short: Box = [0, 0, 400, 20];
    const opening = openByPress('text', { x: 0, y: 30 }, short);
    expect(typedBox(opening, 'a\nb', 10, short, false)[3]).toBe(20);
  });
});

describe('a box opened by a drag', () => {
  it('is as wide as the drag and at least as high, from its top left', () => {
    const opening = openByDrag({ x: 300, y: 500 }, { x: 100, y: 600 }, 10);
    expect(typedBox(opening, 'Hello', 10, LETTER, true)).toEqual([100, 500, 300, 600]);
  });

  it('grows down past the drag to hold its lines', () => {
    const opening = openByDrag({ x: 100, y: 600 }, { x: 130, y: 595 }, 10);
    const [, bottom, right] = typedBox(opening, 'Hello Hello Hello', 10, LETTER, true);
    expect(right).toBe(130);
    expect(bottom).toBeCloseTo(600 - THREE_LINES);
  });

  it('is never narrower than one character', () => {
    expect(openByDrag({ x: 100, y: 600 }, { x: 101, y: 500 }, 10).width).toBe(
      10 + 2 * PDF_TEXT_PADDING_PT,
    );
  });
});

describe('typedOf', () => {
  it('makes nothing of nothing but spaces', () => {
    expect(typedOf(openByPress('text', { x: 1, y: 700 }, LETTER), ' \n ', 10, LETTER)).toBeNull();
  });

  it('makes a Text of its narrowed box and words', () => {
    expect(typedOf(openByPress('text', { x: 100, y: 700 }, LETTER), 'Hello', 10, LETTER)).toEqual({
      kind: 'text',
      rect: [100, 700 - ONE_LINE, 100 + HELLO_BOX, 700],
      words: 'Hello',
      size: 10,
      callout: null,
    });
  });

  it('hangs a Callout’s box from its top right where what is meant lies to the right, its line to the near side', () => {
    const opening = openByPress('callout', { x: 300, y: 700 }, LETTER, { x: 500, y: 600 });
    const made = typedOf(opening, 'Hello', 10, LETTER)!;
    expect(made.rect).toEqual([300 - HELLO_BOX, 700 - ONE_LINE, 300, 700]);
    expect(made.callout).toEqual([
      500,
      600,
      300 + PDF_CALLOUT_KNEE_PT,
      700 - ONE_LINE / 2,
      300,
      700 - ONE_LINE / 2,
    ]);
  });
});

describe('addTyped', () => {
  const text = (over: Partial<Typed> = {}): Typed => ({
    kind: 'text',
    rect: [10, 20, 110, 70],
    words: 'Check',
    size: 12,
    callout: null,
    ...over,
  });

  it('makes the mark in the look given, as one change that names the stored file', () => {
    const doc = PdfLiveChanges.load();
    const origins: unknown[] = [];
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
    expect(addTyped(doc, { page, stored }, text(), by('t1')).ok).toBe(true);
    expect(PdfLiveChanges.marks(doc)).toEqual([
      {
        id: 't1',
        kind: 'text',
        page,
        rect: [10, 20, 110, 70],
        words: 'Check',
        size: 12,
        ...TYPED_LOOK,
        author: 'Ada',
        createdAt: T,
        modifiedAt: T,
      },
    ]);
    expect(PdfLiveChanges.stored(doc)).toEqual(stored);
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('makes a Callout with its line, beside a mark made before it', () => {
    const doc = PdfLiveChanges.load();
    const callout = [0, 0, 1, 1, 10, 45] as const;
    addTyped(doc, { page, stored }, text(), by('a1'));
    addTyped(doc, { page, stored }, text({ kind: 'callout', callout }), by('c1'));
    expect(PdfLiveChanges.marks(doc)[1]).toMatchObject({ kind: 'callout', callout });
  });

  it('makes nothing of a Callout with no line, or of words no mark holds', () => {
    const doc = PdfLiveChanges.load();
    expect(addTyped(doc, { page, stored }, text({ kind: 'callout' }), by('c1'))).toEqual({
      ok: false,
      reason: 'no_words',
    });
    expect(addTyped(doc, { page, stored }, text({ words: '  ' }), by('t1'))).toEqual({
      ok: false,
      reason: 'no_words',
    });
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
  });

  it('is refused past PDF_MAX_MARKS', () => {
    const doc = PdfLiveChanges.load();
    doc.transact(() => {
      const marks = doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    expect(addTyped(doc, { page, stored }, text(), by('one-more'))).toEqual({
      ok: false,
      reason: 'pdf_too_many_marks',
    });
  });
});

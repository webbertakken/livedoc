// docs/specs/035-pdf-documents/marks.md "Making a mark": the words wrap at the box's width, a word wider than the box
// broken where it meets the side; a paragraph reading right to left is set against the box's right side; lines are
// 1.2 times the size apart, PDF_TEXT_PADDING_PT inside the box; a Callout's line meets the side facing what is meant.
import { describe, expect, it } from 'vitest';
import { Helvetica, HELVETICA_STAND_IN } from './helvetica';
import { PDF_CALLOUT_KNEE_PT, PDF_TEXT_PADDING_PT } from './limits';
import { MarkFaces } from './mark-faces';
import type { TextAlign } from './mark';
import { TYPED_LINE_HEIGHT, TypedLayout } from './typed-layout';

// "Hello" in Helvetica: H 722, e 556, l 222, l 222, o 556 thousandths.
const HELLO_AT_10 = 22.78;

describe('Helvetica', () => {
  it('writes WinAnsi’s characters at their own codes or WinAnsi’s, and a stand-in for the rest', () => {
    expect(Helvetica.code('A'.codePointAt(0)!)).toBe(0x41);
    expect(Helvetica.code('é'.codePointAt(0)!)).toBe(0xe9);
    expect(Helvetica.code('€'.codePointAt(0)!)).toBe(0x80);
    expect(Helvetica.writes('א'.codePointAt(0)!)).toBe(false);
    expect(Helvetica.code('א'.codePointAt(0)!)).toBe(HELVETICA_STAND_IN.codePointAt(0));
    expect(Helvetica.width('א'.codePointAt(0)!)).toBe(Helvetica.width(0x3f));
  });
});

describe('TypedLayout', () => {
  it('measures a line in Helvetica at its size', () => {
    const [line] = TypedLayout.lines('Hello', 10, 200);
    expect(line!.text).toBe('Hello');
    expect(line!.width).toBeCloseTo(HELLO_AT_10, 6);
    expect(line!.rtl).toBe(false);
  });

  it('breaks lines at the spaces where the next word would pass the box', () => {
    // Room for "Hello Hello" (22.78 * 2 + 2.78 = 48.34) but not a third.
    const width = 50 + 2 * PDF_TEXT_PADDING_PT;
    expect(TypedLayout.lines('Hello Hello Hello', 10, width).map((line) => line.text)).toEqual([
      'Hello Hello',
      'Hello',
    ]);
  });

  it('keeps each typed line break, an empty line included', () => {
    expect(TypedLayout.lines('one\r\n\ntwo', 10, 200).map((line) => line.text)).toEqual([
      'one',
      '',
      'two',
    ]);
  });

  it('breaks a word wider than the box where it meets the side, a character at the least', () => {
    const width = 12 + 2 * PDF_TEXT_PADDING_PT;
    expect(TypedLayout.lines('Hello', 10, width).map((line) => line.text)).toEqual([
      'H',
      'ell',
      'o',
    ]);
    expect(TypedLayout.lines('HH', 10, 1).map((line) => line.text)).toEqual(['H', 'H']);
  });

  it('carries on after a broken word on the line its last piece began', () => {
    const width = 31 + 2 * PDF_TEXT_PADDING_PT;
    expect(TypedLayout.lines('a HelloHello b', 10, width).map((line) => line.text)).toEqual([
      'a',
      'HelloH',
      'ello b',
    ]);
  });

  it('reads a paragraph’s direction from its first letter with one', () => {
    const lines = TypedLayout.lines('12 שלום\n12 Hello\n...', 10, 200);
    expect(lines.map((line) => line.rtl)).toEqual([true, false, false]);
  });

  it('measures the box that holds lines', () => {
    expect(TypedLayout.height(2, 10)).toBeCloseTo(
      2 * PDF_TEXT_PADDING_PT + 2 * TYPED_LINE_HEIGHT * 10,
    );
    const lines = TypedLayout.lines('Hello\nHello Hello', 10, 200);
    expect(TypedLayout.width(lines)).toBeCloseTo(2 * PDF_TEXT_PADDING_PT + 2 * HELLO_AT_10 + 2.78);
    expect(TypedLayout.width([])).toBe(2 * PDF_TEXT_PADDING_PT);
  });

  it('places lines from the box’s top down, each against its own side', () => {
    const placed = TypedLayout.place({
      rect: [100, 500, 300, 600],
      words: 'Hello\nשלום',
      size: 10,
    });
    expect(placed[0]!.x).toBe(100 + PDF_TEXT_PADDING_PT);
    expect(placed[0]!.y).toBeCloseTo(600 - PDF_TEXT_PADDING_PT - 8.555, 6);
    expect(placed[1]!.x).toBeCloseTo(300 - PDF_TEXT_PADDING_PT - placed[1]!.width, 6);
    expect(placed[0]!.y - placed[1]!.y).toBeCloseTo(TYPED_LINE_HEIGHT * 10, 6);
  });

  // marks.md "Changing a mark": Format > Align text.
  describe('aligned', () => {
    const rect = [100, 500, 300, 600] as const;
    const place = (words: string, align: TextAlign) =>
      TypedLayout.place({ rect, words, size: 10, align });

    it('sets every line against the side chosen, whichever way it reads', () => {
      const [left, hebrew] = place('Hello\nשלום', 'left');
      expect(left!.x).toBe(100 + PDF_TEXT_PADDING_PT);
      expect(hebrew!.x).toBe(100 + PDF_TEXT_PADDING_PT);
      const [right] = place('Hello', 'right');
      expect(right!.x).toBeCloseTo(300 - PDF_TEXT_PADDING_PT - HELLO_AT_10, 6);
    });

    it('centres every line midway between the sides', () => {
      const [line] = place('Hello', 'centre');
      expect(line!.x).toBeCloseTo(200 - HELLO_AT_10 / 2, 6);
    });

    it('stretches each line but a paragraph’s last to the padding on both sides, a piece a word', () => {
      // "Hello" five times at 10 points wraps as four and one in a box 120 wide.
      const placed = TypedLayout.place({
        rect: [0, 0, 120, 100],
        words: 'Hello Hello Hello Hello Hello\nHello',
        size: 10,
        align: 'justified',
      });
      const first = placed.filter((line) => line.y === placed[0]!.y);
      expect(first.map((piece) => piece.text)).toEqual(['Hello', 'Hello', 'Hello', 'Hello']);
      expect(first[0]!.x).toBe(PDF_TEXT_PADDING_PT);
      expect(first[3]!.x + first[3]!.width).toBeCloseTo(120 - PDF_TEXT_PADDING_PT, 6);
      const gaps = first.slice(1).map((piece, at) => piece.x - first[at]!.x - first[at]!.width);
      expect(gaps.every((gap) => Math.abs(gap - gaps[0]!) < 1e-9)).toBe(true);
      // A paragraph's last line, and the last line of all, are set from their own side.
      expect(placed.filter((line) => line.y !== placed[0]!.y).map((line) => line.x)).toEqual([
        PDF_TEXT_PADDING_PT,
        PDF_TEXT_PADDING_PT,
      ]);
    });

    it('stretches a right-to-left line from its right, its first word there', () => {
      const words = 'שלום שלום שלום שלום שלום שלום שלום שלום שלום שלום\nx';
      const placed = TypedLayout.place({
        rect: [0, 0, 120, 200],
        words,
        size: 10,
        align: 'justified',
      });
      const first = placed.filter((line) => line.y === placed[0]!.y);
      expect(first.length).toBeGreaterThan(1);
      expect(first.every((piece) => piece.rtl)).toBe(true);
      expect(first[0]!.x + first[0]!.width).toBeCloseTo(120 - PDF_TEXT_PADDING_PT, 6);
      expect(first.at(-1)!.x).toBeCloseTo(PDF_TEXT_PADDING_PT, 6);
    });

    it('sets a line of one word from its own side, unstretched', () => {
      const placed = TypedLayout.place({
        rect: [0, 0, 30, 100],
        words: 'Hello Hello',
        size: 10,
        align: 'justified',
      });
      expect(placed.map((line) => line.x)).toEqual([PDF_TEXT_PADDING_PT, PDF_TEXT_PADDING_PT]);
    });
  });

  it('reads which way a mark’s paragraphs read: all one way, or mixed', () => {
    expect(TypedLayout.direction('Hello\n\n12')).toBe('ltr');
    expect(TypedLayout.direction('שלום\nمرحبا')).toBe('rtl');
    expect(TypedLayout.direction('Hello\nשלום')).toBe('mixed');
  });

  it('runs a Callout’s line to the side of its box facing what is meant, through a knee', () => {
    const box = [100, 500, 300, 600] as const;
    expect(TypedLayout.calloutLine({ x: 20, y: 400 }, box)).toEqual([
      20,
      400,
      100 - PDF_CALLOUT_KNEE_PT,
      550,
      100,
      550,
    ]);
    expect(TypedLayout.calloutLine({ x: 400, y: 700 }, box)).toEqual([
      400,
      700,
      300 + PDF_CALLOUT_KNEE_PT,
      550,
      300,
      550,
    ]);
  });
});

// marks.md "Words in every script", "Laying out": words Helvetica cannot write are measured in the mark faces.
describe('TypedLayout in the mark faces', () => {
  it('measures a mark in the mark faces where Helvetica cannot write its words', () => {
    expect(TypedLayout.faces('Hello\nWorld')).toBe('helvetica');
    expect(TypedLayout.faces('Hello\nΚόσμε')).toBe('embedded');
    const [hello, world] = TypedLayout.lines('Hello\nΚόσμε', 10, 400);
    // Every line of the mark in Noto Sans, the Latin one too: "Hello" is 2,580 thousandths there.
    expect(hello!.width).toBeCloseTo(MarkFaces.width({ text: 'Hello', bold: false }) / 100);
    expect(hello!.width).not.toBeCloseTo(HELLO_AT_10);
    expect(world!.width).toBeCloseTo(MarkFaces.width({ text: 'Κόσμε', bold: false }) / 100);
  });

  it('composes the words first, so a letter typed with its accent apart is one Helvetica writes', () => {
    expect(TypedLayout.faces('cafe\u0301')).toBe('helvetica');
    expect(TypedLayout.lines('cafe\u0301', 10, 400)[0]!.text).toBe('café');
  });
});

// marks.md "Words in every script": a mark in a chosen font is measured in its family first.
describe('TypedLayout in a chosen font', () => {
  it('sets every mark in a chosen font in the embedded faces', () => {
    expect(TypedLayout.faces('Hello', 'Lora')).toBe('embedded');
  });

  it('measures and wraps the words in the family', () => {
    const [line] = TypedLayout.lines('Hello', 10, 400, 'Pacifico');
    expect(line!.width).toBeCloseTo(
      MarkFaces.width({ text: 'Hello', bold: false, font: 'Pacifico' }) / 100,
    );
    const words = 'iiii iiii iiii iiii';
    const narrow = TypedLayout.lines(words, 10, 80, 'Roboto Mono').length;
    const wide = TypedLayout.lines(words, 10, 80, 'Amatic SC').length;
    expect(narrow).toBeGreaterThan(wide);
  });

  it('places a mark in its own font', () => {
    const rect = [0, 0, 400, 100] as const;
    const [placed] = TypedLayout.place({ rect, words: 'Hello', size: 10, font: 'Lora' });
    expect(placed!.width).toBeCloseTo(TypedLayout.lines('Hello', 10, 400, 'Lora')[0]!.width);
  });
});

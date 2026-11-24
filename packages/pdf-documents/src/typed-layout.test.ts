// docs/specs/035-pdf-documents/marks.md "Making a mark": the words wrap at the box's width, a word wider than the box
// broken where it meets the side; a paragraph reading right to left is set against the box's right side; lines are
// 1.2 times the size apart, PDF_TEXT_PADDING_PT inside the box; a Callout's line meets the side facing what is meant.
import { describe, expect, it } from 'vitest';
import { Helvetica, HELVETICA_STAND_IN } from './helvetica';
import { PDF_CALLOUT_KNEE_PT, PDF_TEXT_PADDING_PT } from './limits';
import { MarkFaces } from './mark-faces';
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
    expect(TypedLayout.faces('Hello\nΚόσμε')).toBe('noto');
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

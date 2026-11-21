// The byte functions and ASC beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Text"): what counts two
// bytes (D43), windows that cut a double-byte character, positions past the end.
import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';
import { byteWidth } from './text-bytes';

describe('byteWidth', () => {
  it.each([
    ['A', 1],
    ['ñ', 1],
    ['熊', 2],
    ['か', 2],
    ['カ', 2],
    ['ｶ', 2],
    ['한', 2],
    ['Ａ', 2],
    ['\u3000', 2],
    ['𠀀', 2],
    ['😀', 1],
  ])('counts %s as %i', (ch, bytes) => {
    expect(byteWidth(ch)).toBe(bytes);
  });
});

describe('a window of bytes', () => {
  const T = { A1: '熊本=熊本' };
  it.each([
    ['=LEFTB(A1, 1)', '熊'],
    ['=LEFTB(A1, 0)', ''],
    ['=LEFTB(A1, 3)', '熊本'],
    ['=RIGHTB(A1, 1)', '本'],
    ['=RIGHTB(A1, 3)', '熊本'],
    ['=RIGHTB(A1, 99)', '熊本=熊本'],
    ['=MIDB(A1, 3, 1)', '='],
    ['=MIDB(A1, 3, 0)', ''],
    ['=MIDB(A1, 6, 4)', ''],
    ['=REPLACEB(A1, 1, 1, "x")', 'x本=熊本'],
    ['=REPLACEB(A1, 6, 1, "x")', '熊本=熊本x'],
    ['=REPLACEB(A1, 3, 0, "x")', '熊本x=熊本'],
    ['=FINDB("=", A1)', 5],
    ['=FINDB("本", A1, 3)', 8],
    ['=SEARCHB("*熊", A1, 2)', 3],
    ['=LENB(A1)', 9],
  ])('%s', (formula, value) => {
    expect(calc(formula, T)).toBe(value);
  });

  it.each([
    '=FINDB("本", A1, 7)',
    '=SEARCHB("x", A1)',
    '=SEARCHB("x", A1, 0)',
    '=SEARCHB("x", A1, 7)',
    '=SEARCHB(REPT("*a", 400), REPT("b", 9000))',
    '=MIDB(A1, 1, -1)',
    '=RIGHTB(A1, -1)',
    '=REPLACEB(A1, 1, -1, "x")',
    '=REPLACEB(A1, "x", 1, "x")',
  ])('%s is #VALUE!', (formula) => {
    expect(calc(formula, T)).toMatchObject({ e: '#VALUE!' });
  });

  it('works each value of an array', () => {
    expect(calc('=SUM(LENB({"熊", "a"; "本本", ""}))')).toBe(7);
  });
});

describe('ASC', () => {
  it.each([
    ['ＡＢＣ　１２３', 'ABC 123'],
    ['ガギグ', 'ｶﾞｷﾞｸﾞ'],
    ['ヴ', 'ｳﾞ'],
    ['「ア」、。', '｢ｱ｣､｡'],
    ['ひらがな', 'ひらがな'],
    ['ヶ', 'ヶ'],
    ['ｶﾞ', 'ｶﾞ'],
  ])('%s is %s', (text, half) => {
    expect(calc(`=ASC("${text}")`)).toBe(half);
  });

  it('reads a decomposed voiced kana as one', () => {
    expect(calc('=ASC("カ"&UNICHAR(12441))')).toBe('ｶﾞ');
  });
});

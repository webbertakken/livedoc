// docs/specs/034-text-documents/objects.md "Special characters": the catalogue generated from Unicode's Character
// Database, by category and block, and the ranges found by codepoint only.
import { describe, expect, it } from 'vitest';
import {
  abbreviationsOf,
  blocksOf,
  categoryOf,
  rangeNameOf,
  specialCharacterCatalogueOf,
} from './special-character-catalogue';

const BLOCKS = `# Blocks-18.0.0.txt
0000..007F; Basic Latin
0080..00FF; Latin-1 Supplement
0300..036F; Combining Diacritical Marks
0900..097F; Devanagari
2000..206F; General Punctuation
2190..21FF; Arrows
4E00..9FFF; CJK Unified Ideographs
AC00..D7AF; Hangul Syllables
E000..F8FF; Private Use Area
`;

const UNICODE_DATA = `0009;<control>;Cc;0;S;;;;;N;CHARACTER TABULATION;;;;
0020;SPACE;Zs;0;WS;;;;;N;;;;;
0021;EXCLAMATION MARK;Po;0;ON;;;;;N;;;;;
0031;DIGIT ONE;Nd;0;EN;;1;1;1;N;;;;;
0041;LATIN CAPITAL LETTER A;Lu;0;L;;;;;N;;;;0061;
005E;CIRCUMFLEX ACCENT;Sk;0;ON;;;;;N;SPACING CIRCUMFLEX;;;;
00A0;NO-BREAK SPACE;Zs;0;CS;<noBreak> 0020;;;;N;NON-BREAKING SPACE;;;;
00A9;COPYRIGHT SIGN;So;0;ON;;;;;N;;;;;
0300;COMBINING GRAVE ACCENT;Mn;230;NSM;;;;;N;NON-SPACING GRAVE;;;;
0915;DEVANAGARI LETTER KA;Lo;0;L;;;;;N;;;;;
093F;DEVANAGARI VOWEL SIGN I;Mc;0;L;;;;;N;;;;;
2002;EN SPACE;Zs;0;WS;<compat> 0020;;;;N;;;;;
200D;ZERO WIDTH JOINER;Cf;0;BN;;;;;N;;;;;
2190;LEFTWARDS ARROW;Sm;0;ON;;;;;N;LEFT ARROW;;;;
2192;RIGHTWARDS ARROW;Sm;0;ON;;;;;N;RIGHT ARROW;;;;
4E00;<CJK Ideograph, First>;Lo;0;L;;;;;N;;;;;
9FFF;<CJK Ideograph, Last>;Lo;0;L;;;;;N;;;;;
AC00;<Hangul Syllable, First>;Lo;0;L;;;;;N;;;;;
D7A3;<Hangul Syllable, Last>;Lo;0;L;;;;;N;;;;;
E000;<Private Use, First>;Co;0;L;;;;;N;;;;;
F8FF;<Private Use, Last>;Co;0;L;;;;;N;;;;;
`;

const NAME_ALIASES = `# NameAliases
0009;TAB;abbreviation
0020;SP;abbreviation
00A0;NBSP;abbreviation
200D;ZWJ;abbreviation
200D;ZERO WIDTH JOINER;figment
`;

describe('blocksOf and abbreviationsOf (the files read)', () => {
  it('reads each block range and name', () => {
    expect(blocksOf(BLOCKS)[5]).toEqual({ first: 0x2190, last: 0x21ff, name: 'Arrows' });
  });

  it('keeps each codepoint first abbreviation alias only', () => {
    const abbreviations = abbreviationsOf(NAME_ALIASES);
    expect(abbreviations.get(0x200d)).toBe('ZWJ');
    expect(abbreviations.size).toBe(4);
  });
});

describe('categoryOf (the categories, after Google)', () => {
  it.each([
    ['Sm', 'Arrows', 'Symbol'],
    ['Sc', 'Currency Symbols', 'Symbol'],
    ['So', 'Latin-1 Supplement', 'Symbol'],
    ['Po', 'General Punctuation', 'Punctuation'],
    ['Nd', 'Basic Latin', 'Number'],
    ['Lm', 'Spacing Modifier Letters', 'Modifier'],
    ['Sk', 'Basic Latin', 'Modifier'],
    ['Mn', 'Combining Diacritical Marks', 'Modifier'],
    ['Mn', 'Devanagari', 'Scripts'],
    ['Mc', 'Devanagari', 'Scripts'],
    ['Zs', 'General Punctuation', 'Format & whitespace'],
    ['Cf', 'General Punctuation', 'Format & whitespace'],
    ['Lu', 'Basic Latin', 'Scripts'],
    ['Lo', 'Devanagari', 'Scripts'],
  ])('puts %s in %s under %s', (general, block, category) => {
    expect(categoryOf(general, block)).toBe(category);
  });

  it.each(['Cc', 'Cs', 'Co', 'Cn'])('leaves out %s', (general) => {
    expect(categoryOf(general, 'Basic Latin')).toBeNull();
  });
});

describe('rangeNameOf (the names of ranged characters)', () => {
  it.each([
    ['CJK Ideograph', 'CJK UNIFIED IDEOGRAPH'],
    ['CJK Ideograph Extension B', 'CJK UNIFIED IDEOGRAPH'],
    ['Tangut Ideograph', 'TANGUT IDEOGRAPH'],
    ['Tangut Ideograph Supplement', 'TANGUT IDEOGRAPH'],
    ['Hangul Syllable', 'HANGUL SYLLABLE'],
  ])('names %s as %s', (label, name) => {
    expect(rangeNameOf(label)).toBe(name);
  });
});

describe('specialCharacterCatalogueOf (the catalogue written)', () => {
  const wire = specialCharacterCatalogueOf({
    version: '18.0.0',
    unicodeData: UNICODE_DATA,
    blocks: BLOCKS,
    nameAliases: NAME_ALIASES,
  });
  const group = (category: number, block: string) =>
    wire.groups.find(([c, b]) => c === category && b === block)?.[2];

  it('groups by category, then block, in their order', () => {
    expect(wire.groups.map(([category, block]) => `${category} ${block}`)).toEqual([
      '0 Latin-1 Supplement',
      '0 Arrows',
      '1 Basic Latin',
      '2 Basic Latin',
      '3 Basic Latin',
      '3 Combining Diacritical Marks',
      '4 Basic Latin',
      '4 Latin-1 Supplement',
      '4 General Punctuation',
      '5 Basic Latin',
      '5 Devanagari',
    ]);
  });

  it('steps each codepoint from the one before in base 36', () => {
    expect(group(0, 'Arrows')).toBe(`${(0x2190).toString(36)}|LEFTWARDS ARROW\n2|RIGHTWARDS ARROW`);
  });

  it('marks a combining mark to sit on a dotted circle', () => {
    expect(group(3, 'Combining Diacritical Marks')).toBe(
      `${(0x300).toString(36)}|COMBINING GRAVE ACCENT|m`,
    );
    expect(group(5, 'Devanagari')?.split('\n')[1]).toBe('16|DEVANAGARI VOWEL SIGN I|m');
  });

  it('gives a space or format character its abbreviation, else its initials', () => {
    expect(group(4, 'General Punctuation')).toBe(
      `${(0x2002).toString(36)}|EN SPACE|=ES\nb|ZERO WIDTH JOINER|=ZWJ`,
    );
    expect(group(4, 'Basic Latin')).toBe(`${(0x20).toString(36)}|SPACE|=SP`);
  });

  it('leaves out controls and private use, and keeps named ranges for codepoints', () => {
    expect(wire.groups.some(([, , entries]) => entries.includes('<control>'))).toBe(false);
    expect(wire.ranges).toEqual([
      [0x4e00, 0x9fff, 'CJK UNIFIED IDEOGRAPH'],
      [0xac00, 0xd7a3, 'HANGUL SYLLABLE'],
    ]);
    expect(wire.version).toBe('18.0.0');
  });
});

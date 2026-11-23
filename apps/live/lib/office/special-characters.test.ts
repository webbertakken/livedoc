// docs/specs/034-text-documents/objects.md "Special characters": the catalogue read, browsed by category and block,
// searched by name words or codepoint, and each character's cell and name.
import { describe, expect, it } from 'vitest';
import file from './special-characters.json';
import { specialCharacterCatalogueOf } from './special-character-catalogue';
import {
  SPECIAL_CHARACTER_CATEGORIES,
  SPECIAL_CHARACTER_RESULTS_MAX,
  blocksIn,
  characterAt,
  characterName,
  characterText,
  codepointLabel,
  codepointOf,
  groupOf,
  searchCharacters,
  specialCharactersOf,
  type SpecialCharacter,
} from './special-characters';

const WIRE = specialCharacterCatalogueOf({
  version: '18.0.0',
  blocks: `0000..007F; Basic Latin
0300..036F; Combining Diacritical Marks
2000..206F; General Punctuation
2190..21FF; Arrows
2700..27BF; Dingbats
AC00..D7AF; Hangul Syllables
`,
  unicodeData: `0021;EXCLAMATION MARK;Po;0;ON;;;;;N;;;;;
0041;LATIN CAPITAL LETTER A;Lu;0;L;;;;;N;;;;0061;
0300;COMBINING GRAVE ACCENT;Mn;230;NSM;;;;;N;;;;;
200D;ZERO WIDTH JOINER;Cf;0;BN;;;;;N;;;;;
2190;LEFTWARDS ARROW;Sm;0;ON;;;;;N;;;;;
2192;RIGHTWARDS ARROW;Sm;0;ON;;;;;N;;;;;
21E8;RIGHTWARDS WHITE ARROW;So;0;ON;;;;;N;;;;;
2794;HEAVY WIDE-HEADED RIGHTWARDS ARROW;So;0;ON;;;;;N;;;;;
AC00;<Hangul Syllable, First>;Lo;0;L;;;;;N;;;;;
D7A3;<Hangul Syllable, Last>;Lo;0;L;;;;;N;;;;;
`,
  nameAliases: '200D;ZWJ;abbreviation\n',
});

const catalogue = specialCharactersOf(WIRE);
const codepoints = (characters: readonly SpecialCharacter[]) => characters.map((c) => c.codepoint);

describe('specialCharactersOf (the generated file read)', () => {
  it('reads each group with its characters and looks', () => {
    expect(groupOf(catalogue, 'Symbol', 'Arrows')).toEqual([
      { codepoint: 0x2190, name: 'LEFTWARDS ARROW', look: { kind: 'glyph' } },
      { codepoint: 0x2192, name: 'RIGHTWARDS ARROW', look: { kind: 'glyph' } },
      { codepoint: 0x21e8, name: 'RIGHTWARDS WHITE ARROW', look: { kind: 'glyph' } },
    ]);
    expect(groupOf(catalogue, 'Modifier', 'Combining Diacritical Marks')[0]?.look).toEqual({
      kind: 'mark',
    });
    expect(groupOf(catalogue, 'Format & whitespace', 'General Punctuation')[0]?.look).toEqual({
      kind: 'abbreviation',
      text: 'ZWJ',
    });
  });

  it('drops what is malformed and keeps the rest', () => {
    const read = specialCharactersOf({
      version: '18.0.0',
      groups: [
        [0, 'Arrows', '1x2|LEFTWARDS ARROW\n|\n2|RIGHTWARDS ARROW'],
        [9, 'Nowhere', '1|X'],
        'junk',
      ],
      ranges: [
        [1, 'x'],
        [0xac00, 0xd7a3, 'HANGUL SYLLABLE'],
      ],
    });
    expect(read.groups).toHaveLength(1);
    expect(read.ranges).toHaveLength(1);
    expect(specialCharactersOf(null).groups).toEqual([]);
  });
});

describe('blocksIn and groupOf (browsing)', () => {
  it('lists the blocks of a category in codepoint order', () => {
    expect(blocksIn(catalogue, 'Symbol')).toEqual(['Arrows', 'Dingbats']);
    expect(blocksIn(catalogue, 'Number')).toEqual([]);
  });

  it('answers nothing for a block outside the category', () => {
    expect(groupOf(catalogue, 'Punctuation', 'Arrows')).toEqual([]);
  });
});

describe('codepointOf (a codepoint typed)', () => {
  it.each([
    ['U+2192', 0x2192],
    ['u+41', 0x41],
    ['2192', 0x2192],
    ['1F600', 0x1f600],
    [' U+10FFFF ', 0x10ffff],
  ])('reads %s', (query, codepoint) => {
    expect(codepointOf(query)).toBe(codepoint);
  });

  it.each(['41', 'arrow', 'U+', 'U+110000', 'U+D800', '1234567'])(
    'reads no codepoint in %s',
    (query) => {
      expect(codepointOf(query)).toBeNull();
    },
  );
});

describe('characterAt (a codepoint found)', () => {
  it('finds a named character, and names a ranged one by rule', () => {
    expect(characterAt(catalogue, 0x2192)?.name).toBe('RIGHTWARDS ARROW');
    expect(characterAt(catalogue, 0xac00)?.name).toBe('HANGUL SYLLABLE GA');
    expect(characterAt(catalogue, 0xd7a3)?.name).toBe('HANGUL SYLLABLE HIH');
    expect(characterAt(catalogue, 0x0001)).toBeNull();
  });
});

describe('searchCharacters (search by name words or codepoint)', () => {
  it('finds characters whose name has a word starting with each word typed, in any case', () => {
    expect(codepoints(searchCharacters(catalogue, 'right arr'))).toEqual([0x2192, 0x21e8, 0x2794]);
    expect(codepoints(searchCharacters(catalogue, 'white RIGHTWARDS'))).toEqual([0x21e8]);
    expect(codepoints(searchCharacters(catalogue, 'wide-headed'))).toEqual([0x2794]);
  });

  it('shows the character of a codepoint first, ranged ones too', () => {
    expect(codepoints(searchCharacters(catalogue, 'U+2192'))).toEqual([0x2192]);
    expect(searchCharacters(catalogue, 'U+AC01')[0]?.name).toBe('HANGUL SYLLABLE GAG');
  });

  it('finds nothing for nothing typed', () => {
    expect(searchCharacters(catalogue, '  ')).toEqual([]);
  });

  it('shows at most the results limit', () => {
    expect(searchCharacters(catalogue, 'a', 2)).toHaveLength(2);
    expect(SPECIAL_CHARACTER_RESULTS_MAX).toBe(600);
  });
});

describe('a character drawn and named', () => {
  it('is its codepoint as text', () => {
    expect(characterText(0x1f600)).toBe('😀');
  });

  it('labels its codepoint with at least four hex digits', () => {
    expect(codepointLabel(0x41)).toBe('U+0041');
    expect(codepointLabel(0x1f600)).toBe('U+1F600');
  });

  it('names it in sentence case, keeping single letters and words with digits', () => {
    expect(characterName('RIGHTWARDS ARROW')).toBe('Rightwards arrow');
    expect(characterName('LATIN SMALL LETTER A')).toBe('Latin small letter A');
    expect(characterName('CJK UNIFIED IDEOGRAPH-4E00')).toBe('Cjk unified ideograph-4E00');
  });
});

describe('special-characters.json (generated by pnpm chars:special)', () => {
  const full = specialCharactersOf(file);

  it('holds every category, read whole', () => {
    expect(full.version).toMatch(/^\d+\.\d+\.\d+$/);
    for (const category of SPECIAL_CHARACTER_CATEGORIES)
      expect(blocksIn(full, category).length).toBeGreaterThan(0);
    expect(full.groups.every((g) => g.characters.length > 0)).toBe(true);
    expect(full.groups.reduce((n, g) => n + g.characters.length, 0)).toBe(
      file.groups.reduce((n, row) => n + String(row[2]).split('\n').length, 0),
    );
  });

  it('opens on Symbol, Arrows', () => {
    expect(blocksIn(full, 'Symbol')).toContain('Arrows');
    expect(characterAt(full, 0x2192)?.name).toBe('RIGHTWARDS ARROW');
    expect(characterAt(full, 0x4e00)?.name).toBe('CJK UNIFIED IDEOGRAPH-4E00');
  });
});

// docs/specs/034-text-documents/lists.md "Numbering", "Levels": each item's marker from its list and level.
import { describe, expect, it } from 'vitest';
import { ListDefinition, type ListPlace } from './lists';
import { ListMarkers, numberText } from './list-markers';

const lists = {
  N: ListDefinition.of('number'),
  B: ListDefinition.of('bullet'),
  C: ListDefinition.of('check'),
  W: {
    levels: [
      { kind: 'number' as const, format: 'decimal' as const, label: '%1.', start: 3 },
      { kind: 'number' as const, format: 'upper-roman' as const, label: '%1.%2)', start: 1 },
    ],
  },
};
const at = (id: string, level = 0, extra: Partial<ListPlace> = {}): ListPlace => ({
  id,
  level,
  ...extra,
});
const texts = (places: (ListPlace | undefined)[], defs: Record<string, ListDefinition> = lists) =>
  ListMarkers.of(places, defs).map((m) => (m ? m.text : null));

describe('numberText', () => {
  it('writes a number in each format', () => {
    expect([1, 4, 27].map((n) => numberText(n, 'decimal'))).toEqual(['1', '4', '27']);
    expect([1, 26, 27, 52, 53].map((n) => numberText(n, 'lower-letter'))).toEqual([
      'a',
      'z',
      'aa',
      'zz',
      'aaa',
    ]);
    expect(numberText(3, 'upper-letter')).toBe('C');
    expect([1, 4, 9, 14, 40, 1994].map((n) => numberText(n, 'lower-roman'))).toEqual([
      'i',
      'iv',
      'ix',
      'xiv',
      'xl',
      'mcmxciv',
    ]);
    expect(numberText(12, 'upper-roman')).toBe('XII');
    expect(numberText(0, 'lower-roman')).toBe('0');
  });
});

describe('ListMarkers.of', () => {
  it('gives a number its own level’s count and format', () => {
    const markers = ListMarkers.of([at('W'), at('W', 1), at('W', 1)], lists);
    expect(markers.map((m) => (m?.kind === 'number' ? [m.value, m.format] : null))).toEqual([
      [3, 'decimal'],
      [1, 'upper-roman'],
      [2, 'upper-roman'],
    ]);
  });

  it('numbers on through a list, past paragraphs in no list', () => {
    expect(texts([at('N'), undefined, at('N'), at('N')])).toEqual(['1.', null, '2.', '3.']);
  });

  it('restarts a deeper level after a shallower item, and keeps each level its own count', () => {
    expect(texts([at('N'), at('N', 1), at('N', 1), at('N'), at('N', 1), at('N', 2)])).toEqual([
      '1.',
      'a.',
      'b.',
      '2.',
      'a.',
      'i.',
    ]);
  });

  it('counts each list on its own, interleaved', () => {
    expect(texts([at('N'), at('W'), at('N'), at('W'), at('W', 1)])).toEqual([
      '1.',
      '3.',
      '2.',
      '4.',
      '4.I)',
    ]);
  });

  it('starts again where an item says so, and gives an unnumbered paragraph no marker', () => {
    expect(
      texts([at('N'), at('N', 0, { unnumbered: true }), at('N', 0, { restart: 5 }), at('N')]),
    ).toEqual(['1.', null, '5.', '6.']);
  });

  it('draws bullets and checkboxes, ticked or not', () => {
    const markers = ListMarkers.of(
      [at('B'), at('B', 1), at('C', 0, { checked: true }), at('C')],
      lists,
    );
    expect(markers).toEqual([
      { kind: 'bullet', text: '●', level: 0 },
      { kind: 'bullet', text: '○', level: 1 },
      { kind: 'check', text: '', level: 0, checked: true },
      { kind: 'check', text: '', level: 0, checked: false },
    ]);
  });

  it('draws an item of a list the document lacks as a bullet, and a level past its levels as the last', () => {
    expect(texts([at('missing'), at('W', 5)])).toEqual(['●', '3.I)']);
  });
});

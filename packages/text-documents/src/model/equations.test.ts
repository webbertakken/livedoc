// docs/specs/034-text-documents/objects.md "The equation model": a row of tokens and structures, within limits;
// "Equations in the formats" (OMML runs read as tokens); "Equations in the editor" (copied as its linear form).
import { describe, expect, it } from 'vitest';
import { EQUATION_MAX_DEPTH, EQUATION_MAX_NODES } from '../limits';
import { Equations, type MathNode, type MathRow } from './equations';

const id = (text: string): MathNode => ({ kind: 'identifier', text });
const num = (text: string): MathNode => ({ kind: 'number', text });
const op = (text: string): MathNode => ({ kind: 'operator', text });

describe('an equation value', () => {
  it('is held when every node is one the model knows', () => {
    const row: MathRow = [
      { kind: 'fraction', numerator: [id('a')], denominator: [id('b'), op('+'), num('1')] },
      { kind: 'scripts', base: [id('x')], sup: [num('2')] },
      { kind: 'scripts', base: [id('y')], sub: [id('i')], sup: [num('2')] },
      { kind: 'root', radicand: [id('z')] },
      { kind: 'root', radicand: [id('z')], index: [num('3')] },
      {
        kind: 'large-operator',
        operator: '∑',
        lower: [id('a')],
        upper: [id('b')],
        body: [id('k')],
      },
      { kind: 'fence', open: '(', close: '', body: [id('p')] },
      { kind: 'accent', base: [id('v')], accent: '→' },
      { kind: 'under-over', base: [id('lim')], under: [id('a'), op('→'), id('b')] },
      { kind: 'text', text: 'if x' },
    ];
    expect(Equations.of(row)).toEqual(row);
  });

  it('is held empty, as a new equation starts', () => {
    expect(Equations.of([])).toEqual([]);
  });

  it.each([
    ['not a list', { kind: 'identifier', text: 'a' }],
    ['an unknown kind', [{ kind: 'matrix', rows: [] }]],
    ['a token of no characters', [{ kind: 'number', text: '' }]],
    ['scripts with neither script', [{ kind: 'scripts', base: [id('x')] }]],
    ['a large operator of no limit rows', [{ kind: 'large-operator', operator: '∑', body: [] }]],
    [
      'a large operator of no character',
      [{ kind: 'large-operator', operator: '', lower: [], upper: [], body: [] }],
    ],
    ['under and over with neither', [{ kind: 'under-over', base: [id('lim')] }]],
    ['an accent of no character', [{ kind: 'accent', base: [id('v')], accent: '' }]],
    ['a fence of a non-string side', [{ kind: 'fence', open: 1, close: ')', body: [] }]],
  ])('is no equation when it is %s', (_, value) => {
    expect(Equations.of(value)).toBeUndefined();
  });

  it('is no equation past the most nodes', () => {
    const row = Array.from({ length: EQUATION_MAX_NODES + 1 }, () => id('x'));
    expect(Equations.of(row)).toBeUndefined();
    expect(Equations.of(row.slice(1))).toHaveLength(EQUATION_MAX_NODES);
  });

  it('is no equation nested past the deepest', () => {
    const nest = (depth: number): MathRow =>
      depth === 1 ? [id('x')] : [{ kind: 'root', radicand: nest(depth - 1) }];
    expect(Equations.of(nest(EQUATION_MAX_DEPTH))).toBeDefined();
    expect(Equations.of(nest(EQUATION_MAX_DEPTH + 1))).toBeUndefined();
  });

  it('counts its nodes and its depth', () => {
    expect(
      Equations.size([id('a'), { kind: 'fraction', numerator: [id('b')], denominator: [] }]),
    ).toEqual({
      nodes: 3,
      depth: 2,
    });
  });
});

describe('an equation read as text', () => {
  it.each<[string, MathRow, string]>([
    ['tokens', [id('a'), op('+'), num('1.5'), { kind: 'text', text: 'if' }], 'a+1.5if'],
    [
      'a fraction of single nodes',
      [{ kind: 'fraction', numerator: [id('a')], denominator: [id('b')] }],
      'a/b',
    ],
    [
      'a fraction of rows',
      [{ kind: 'fraction', numerator: [id('a'), op('+'), num('1')], denominator: [id('b')] }],
      '(a+1)/b',
    ],
    ['a superscript', [{ kind: 'scripts', base: [id('x')], sup: [num('2')] }], 'x^2'],
    [
      'both scripts',
      [{ kind: 'scripts', base: [id('x')], sub: [num('1')], sup: [num('2')] }],
      'x_1^2',
    ],
    ['a square root', [{ kind: 'root', radicand: [id('z')] }], '√z'],
    ['an nth root', [{ kind: 'root', radicand: [id('z')], index: [id('n')] }], '√(n&z)'],
    [
      'a large operator',
      [
        {
          kind: 'large-operator',
          operator: '∑',
          lower: [id('a')],
          upper: [id('b')],
          body: [id('k')],
        },
      ],
      '∑_a^b k',
    ],
    ['a fence', [{ kind: 'fence', open: '[', close: ')', body: [id('p')] }], '[p)'],
    ['an accent', [{ kind: 'accent', base: [id('v')], accent: '→' }], 'v→'],
    [
      'a limit',
      [{ kind: 'under-over', base: [id('lim')], under: [id('a'), op('→'), id('b')] }],
      'lim_(a→b)',
    ],
    ['an empty row', [{ kind: 'fraction', numerator: [], denominator: [id('b')] }], '()/b'],
  ])('reads %s', (_, row, text) => {
    expect(Equations.linear(row)).toBe(text);
  });
});

describe("an OMML run's characters", () => {
  it('read as numbers, letters and operators, spaces dropped', () => {
    expect(Equations.tokens('b + 12.5x', false)).toEqual([id('b'), op('+'), num('12.5'), id('x')]);
  });

  it('read an upright word as one identifier', () => {
    expect(Equations.tokens('sin', true)).toEqual([id('sin')]);
    expect(Equations.tokens('sin', false)).toEqual([id('s'), id('i'), id('n')]);
  });

  it('read a character outside the basic plane as one character', () => {
    expect(Equations.tokens('𝔸≤', false)).toEqual([id('𝔸'), op('≤')]);
  });

  it('read a point with no digit after it as an operator', () => {
    expect(Equations.tokens('1.', false)).toEqual([num('1'), op('.')]);
  });
});

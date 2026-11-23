// docs/specs/034-text-documents/objects.md "Equations in the formats", written: an equation's frame holds its maths
// within a fifth of the size LibreOffice 24.2 lays each out at (measured from its own frames, 12 pt, in inches).
import { describe, expect, it } from 'vitest';
import type { MathNode, MathRow } from '../model/equations';
import { odfEquationSize } from './odf-equation-size';

const id = (text: string): MathNode => ({ kind: 'identifier', text });
const num = (text: string): MathNode => ({ kind: 'number', text });
const op = (text: string): MathNode => ({ kind: 'operator', text });

/** Each equation with LibreOffice's own frame for it, width and height in inches. */
const MEASURED: [string, MathRow, number, number][] = [
  ['x', [id('x')], 0.0925, 0.1854],
  ['six letters', [id('a'), id('b'), id('c'), id('d'), id('e'), id('f')], 0.6098, 0.1854],
  ['x+1', [id('x'), op('+'), num('1')], 0.2917, 0.1854],
  ['a number', [num('12345')], 0.4193, 0.1854],
  ['a/b', [{ kind: 'fraction', numerator: [id('a')], denominator: [id('b')] }], 0.1236, 0.3953],
  [
    '(a+1)/(b+2)',
    [
      {
        kind: 'fraction',
        numerator: [id('a'), op('+'), num('1')],
        denominator: [id('b'), op('+'), num('2')],
      },
    ],
    0.3244,
    0.3953,
  ],
  ['x^2', [{ kind: 'scripts', base: [id('x')], sup: [num('2')] }], 0.1437, 0.2091],
  [
    'x_1^2',
    [{ kind: 'scripts', base: [id('x')], sub: [num('1')], sup: [num('2')] }],
    0.1437,
    0.2339,
  ],
  ['a square root', [{ kind: 'root', radicand: [id('z')] }], 0.1862, 0.2],
  ['an nth root', [{ kind: 'root', radicand: [id('z')], index: [id('n')] }], 0.1862, 0.2165],
  [
    'a sum',
    [
      {
        kind: 'large-operator',
        operator: '∑',
        lower: [id('a')],
        upper: [id('b')],
        body: [id('k')],
      },
    ],
    0.3146,
    0.452,
  ],
  [
    'an integral',
    [
      {
        kind: 'large-operator',
        operator: '∫',
        lower: [num('0')],
        upper: [num('1')],
        body: [id('f')],
      },
    ],
    0.2425,
    0.4752,
  ],
  ['a fence', [{ kind: 'fence', open: '(', close: ')', body: [id('p')] }], 0.1917, 0.2055],
  ['an accent', [{ kind: 'accent', base: [id('v')], accent: '→' }], 0.0898, 0.1854],
  [
    'a limit',
    [{ kind: 'under-over', base: [id('lim')], under: [id('a'), op('→'), id('b')] }],
    0.3457,
    0.2965,
  ],
  ['text', [{ kind: 'text', text: 'if x' }], 0.239, 0.1854],
  [
    'E=mc^2',
    [id('E'), op('='), id('m'), { kind: 'scripts', base: [id('c')], sup: [num('2')] }],
    0.5382,
    0.2091,
  ],
  [
    'a nested fraction',
    [
      {
        kind: 'fraction',
        numerator: [id('a')],
        denominator: [{ kind: 'fraction', numerator: [id('b')], denominator: [id('c')] }],
      },
    ],
    0.1571,
    0.6047,
  ],
  [
    'a fenced fraction',
    [
      {
        kind: 'fence',
        open: '(',
        close: ')',
        body: [{ kind: 'fraction', numerator: [id('a')], denominator: [id('b')] }],
      },
    ],
    0.2535,
    0.4362,
  ],
];

describe("an equation's frame", () => {
  it.each(MEASURED)('holds %s as LibreOffice lays it out', (_, row, width, height) => {
    const size = odfEquationSize(row);
    // LibreOffice drops an accent (it reads `mover accent` as its base alone): its height is Word's.
    const tall = row[0]!.kind === 'accent' ? 1.25 : 1.2;
    expect(size.width / (width * 72)).toBeGreaterThan(0.8);
    expect(size.width / (width * 72)).toBeLessThan(1.2);
    expect(size.height / (height * 72)).toBeGreaterThan(0.8);
    expect(size.height / (height * 72)).toBeLessThan(tall);
  });

  it('is never narrower than half an em, so an empty equation still shows', () => {
    expect(odfEquationSize([])).toEqual({ width: 6, height: 13.35 });
  });
});

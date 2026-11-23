// docs/specs/034-text-documents/objects.md "Equations in the formats": MathML read into the model's nodes (semantics
// as its first child, mrow flattened or a fence, a large operator taking the node after it as its body) and written
// back; anything the model does not map leaves the equation kept.
import { parseXml, type XmlElement } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import type { MathNode, MathRow } from '../model/equations';
import { mathMlXml } from '../model/equation-mathml';
import { readMathMl } from './odf-equations';

const MATHML = 'http://www.w3.org/1998/Math/MathML';
const math = (inner: string, attrs = ''): XmlElement => {
  const parsed = parseXml(`<math xmlns="${MATHML}"${attrs}>${inner}</math>`);
  if (!parsed.ok) throw new Error('unparsed');
  return parsed.root;
};
const id = (text: string): MathNode => ({ kind: 'identifier', text });
const num = (text: string): MathNode => ({ kind: 'number', text });
const op = (text: string): MathNode => ({ kind: 'operator', text });

describe('MathML read', () => {
  it("reads LibreOffice's equation: semantics, nested rows, the StarMath annotation left behind", () => {
    const row = readMathMl(
      math(
        '<semantics><mrow><mrow><mfrac><mi>a</mi><mi>b</mi></mfrac><mo stretchy="false">+</mo><msup><mi>x</mi><mn>2</mn></msup></mrow><msqrt><mi>z</mi></msqrt></mrow><annotation encoding="StarMath 5.0">{a} over {b}</annotation></semantics>',
        ' display="block"',
      ),
    );
    expect(row).toEqual([
      { kind: 'fraction', numerator: [id('a')], denominator: [id('b')] },
      op('+'),
      { kind: 'scripts', base: [id('x')], sup: [num('2')] },
      { kind: 'root', radicand: [id('z')] },
    ]);
  });

  it.each<[string, string, MathRow]>([
    [
      'a subscript',
      '<msub><mi>y</mi><mi>i</mi></msub>',
      [{ kind: 'scripts', base: [id('y')], sub: [id('i')] }],
    ],
    [
      'both scripts',
      '<msubsup><mi>x</mi><mn>1</mn><mn>2</mn></msubsup>',
      [{ kind: 'scripts', base: [id('x')], sub: [num('1')], sup: [num('2')] }],
    ],
    [
      'an nth root',
      '<mroot><mi>z</mi><mn>3</mn></mroot>',
      [{ kind: 'root', radicand: [id('z')], index: [num('3')] }],
    ],
    [
      'a sum with its body after it',
      '<mrow><munderover><mo stretchy="false">∑</mo><mi>a</mi><mi>b</mi></munderover><mi>k</mi></mrow>',
      [
        {
          kind: 'large-operator',
          operator: '∑',
          lower: [id('a')],
          upper: [id('b')],
          body: [id('k')],
        },
      ],
    ],
    [
      'an integral with scripts and no body',
      '<msubsup><mo>∫</mo><mn>0</mn><mi>∞</mi></msubsup>',
      [{ kind: 'large-operator', operator: '∫', lower: [num('0')], upper: [id('∞')], body: [] }],
    ],
    [
      'a fence of fence operators',
      '<mrow><mo fence="true">(</mo><mi>p</mi><mo>+</mo><mn>1</mn><mo fence="true">]</mo></mrow>',
      [{ kind: 'fence', open: '(', close: ']', body: [id('p'), op('+'), num('1')] }],
    ],
    [
      'an mfenced',
      '<mfenced open="{" close=""><mi>p</mi></mfenced>',
      [{ kind: 'fence', open: '{', close: '', body: [id('p')] }],
    ],
    [
      'an accent',
      '<mover accent="true"><mi>v</mi><mo>→</mo></mover>',
      [{ kind: 'accent', base: [id('v')], accent: '→' }],
    ],
    [
      'a limit under its name',
      '<munder><mi>lim</mi><mrow><mi>a</mi><mo>→</mo><mi>b</mi></mrow></munder>',
      [{ kind: 'under-over', base: [id('lim')], under: [id('a'), op('→'), id('b')] }],
    ],
    ['text', '<mtext>if x</mtext>', [{ kind: 'text', text: 'if x' }]],
    ['an upright word', '<mi mathvariant="normal">sin</mi>', [id('sin')]],
    ['an empty token, left out', '<mi> </mi><mn>1</mn>', [num('1')]],
  ])('reads %s', (_, inner, row) => {
    expect(readMathMl(math(inner))).toEqual(row);
  });

  it('reads a bracket that opens no fence as an operator', () => {
    expect(readMathMl(math('<mrow><mo>(</mo><mi>p</mi></mrow>'))).toEqual([op('('), id('p')]);
  });

  it.each([
    ['a table', '<mtable><mtr><mtd><mi>a</mi></mtd></mtr></mtable>'],
    ['a styled letter', '<mi mathvariant="bold">a</mi>'],
    ['a coloured token', '<mi mathcolor="red">a</mi>'],
    ['a style around the maths', '<mstyle displaystyle="true"><mi>a</mi></mstyle>'],
    ['a fraction of one child', '<mfrac><mi>a</mi></mfrac>'],
    ['a token holding elements', '<mi><mglyph/></mi>'],
  ])('keeps an equation holding %s', (_, inner) => {
    expect(readMathMl(math(inner))).toBeUndefined();
  });

  it('keeps an equation past the most nodes', () => {
    expect(readMathMl(math('<mi>a</mi>'.repeat(2001)))).toBeUndefined();
  });
});

describe('MathML written', () => {
  const ROW: MathRow = [
    { kind: 'fraction', numerator: [id('a')], denominator: [id('b'), op('+'), num('1')] },
    { kind: 'scripts', base: [id('x')], sub: [num('1')], sup: [num('2')] },
    { kind: 'scripts', base: [id('x')], sup: [num('2')] },
    { kind: 'scripts', base: [id('y')], sub: [id('i')] },
    { kind: 'root', radicand: [id('z')] },
    { kind: 'root', radicand: [id('z')], index: [num('3')] },
    { kind: 'large-operator', operator: '∑', lower: [id('a')], upper: [id('b')], body: [id('k')] },
    { kind: 'large-operator', operator: '∫', lower: [num('0')], upper: [], body: [id('f')] },
    { kind: 'large-operator', operator: '∏', lower: [], upper: [id('n')], body: [] },
    { kind: 'fence', open: '(', close: '', body: [id('p')] },
    { kind: 'accent', base: [id('v')], accent: '→' },
    { kind: 'under-over', base: [id('lim')], under: [id('a')], over: [id('b')] },
    { kind: 'under-over', base: [id('x')], over: [id('b')] },
    { kind: 'text', text: 'a < b & c' },
    { kind: 'fraction', numerator: [op('('), id('p'), op(')')], denominator: [num('2')] },
  ];

  it('reads back as it was written, every node', () => {
    const parsed = parseXml(mathMlXml(ROW));
    expect(parsed.ok && readMathMl(parsed.root)).toEqual(ROW);
  });

  it('writes in the MathML namespace, its text escaped', () => {
    const xml = mathMlXml([{ kind: 'text', text: 'a < b & c' }]);
    expect(xml).toBe(`<math xmlns="${MATHML}"><mrow><mtext>a &lt; b &amp; c</mtext></mrow></math>`);
  });

  it('writes an integral with scripts and a sum under and over', () => {
    expect(mathMlXml(ROW.slice(6, 8))).toContain('<munderover><mo>∑</mo>');
    expect(mathMlXml(ROW.slice(7, 8))).toContain('<msub><mo>∫</mo>');
  });
});

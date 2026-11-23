// docs/specs/034-text-documents/objects.md "Equations in the formats": OMML read into the model's nodes (runs as
// tokens, m:func as its name then its argument, limits one inside the other as one node) and written back; anything
// the model does not map leaves the equation kept.
import { parseXml, type XmlElement } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import type { MathNode, MathRow } from '../model/equations';
import { M_NS, ommlXml, readOmml } from './ooxml-equations';
import { W_NS } from './ooxml-names';

const oMath = (inner: string): XmlElement => {
  const parsed = parseXml(`<m:oMath xmlns:m="${M_NS}" xmlns:w="${W_NS}">${inner}</m:oMath>`);
  if (!parsed.ok) throw new Error('unparsed');
  return parsed.root;
};
const r = (text: string, pr = '') =>
  `<m:r>${pr}<w:rPr><w:rFonts w:ascii="Cambria Math"/></w:rPr><m:t>${text}</m:t></m:r>`;
const id = (text: string): MathNode => ({ kind: 'identifier', text });
const num = (text: string): MathNode => ({ kind: 'number', text });
const op = (text: string): MathNode => ({ kind: 'operator', text });

describe('OMML read', () => {
  it('reads runs as tokens, an upright word as one identifier and normal text as text', () => {
    expect(
      readOmml(
        oMath(
          r('b+12') +
            r('sin', '<m:rPr><m:sty m:val="p"/></m:rPr>') +
            r('if x', '<m:rPr><m:nor/></m:rPr>'),
        ),
      ),
    ).toEqual([id('b'), op('+'), num('12'), id('sin'), { kind: 'text', text: 'if x' }]);
  });

  it.each<[string, string, MathRow]>([
    [
      'a fraction',
      `<m:f><m:fPr><m:ctrlPr/></m:fPr><m:num>${r('a')}</m:num><m:den>${r('b')}</m:den></m:f>`,
      [{ kind: 'fraction', numerator: [id('a')], denominator: [id('b')] }],
    ],
    [
      'a superscript',
      `<m:sSup><m:e>${r('x')}</m:e><m:sup>${r('2')}</m:sup></m:sSup>`,
      [{ kind: 'scripts', base: [id('x')], sup: [num('2')] }],
    ],
    [
      'a subscript',
      `<m:sSub><m:e>${r('y')}</m:e><m:sub>${r('i')}</m:sub></m:sSub>`,
      [{ kind: 'scripts', base: [id('y')], sub: [id('i')] }],
    ],
    [
      'both scripts',
      `<m:sSubSup><m:e>${r('x')}</m:e><m:sub>${r('1')}</m:sub><m:sup>${r('2')}</m:sup></m:sSubSup>`,
      [{ kind: 'scripts', base: [id('x')], sub: [num('1')], sup: [num('2')] }],
    ],
    [
      'a square root',
      `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${r('z')}</m:e></m:rad>`,
      [{ kind: 'root', radicand: [id('z')] }],
    ],
    [
      'an nth root',
      `<m:rad><m:deg>${r('3')}</m:deg><m:e>${r('z')}</m:e></m:rad>`,
      [{ kind: 'root', radicand: [id('z')], index: [num('3')] }],
    ],
    [
      'a sum',
      `<m:nary><m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/></m:naryPr><m:sub>${r('a')}</m:sub><m:sup>${r('b')}</m:sup><m:e>${r('k')}</m:e></m:nary>`,
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
      'an integral by default, its hidden limit empty',
      `<m:nary><m:naryPr><m:supHide m:val="1"/></m:naryPr><m:sub>${r('0')}</m:sub><m:sup/><m:e>${r('f')}</m:e></m:nary>`,
      [{ kind: 'large-operator', operator: '∫', lower: [num('0')], upper: [], body: [id('f')] }],
    ],
    [
      'a fence of round brackets by default',
      `<m:d><m:e>${r('p')}</m:e></m:d>`,
      [{ kind: 'fence', open: '(', close: ')', body: [id('p')] }],
    ],
    [
      'a fence of its own characters, one empty',
      `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val=""/></m:dPr><m:e>${r('p')}</m:e></m:d>`,
      [{ kind: 'fence', open: '[', close: '', body: [id('p')] }],
    ],
    [
      'an accent, a hat by default',
      `<m:acc><m:e>${r('v')}</m:e></m:acc>`,
      [{ kind: 'accent', base: [id('v')], accent: '\u0302' }],
    ],
    [
      'a limit under its name',
      `<m:limLow><m:e>${r('lim', '<m:rPr><m:sty m:val="p"/></m:rPr>')}</m:e><m:lim>${r('a→b')}</m:lim></m:limLow>`,
      [{ kind: 'under-over', base: [id('lim')], under: [id('a'), op('→'), id('b')] }],
    ],
    [
      'a function as its name then its argument',
      `<m:func><m:fName>${r('sin', '<m:rPr><m:sty m:val="p"/></m:rPr>')}</m:fName><m:e>${r('x')}</m:e></m:func>`,
      [id('sin'), id('x')],
    ],
  ])('reads %s', (_, inner, row) => {
    expect(readOmml(oMath(inner))).toEqual(row);
  });

  it('reads a lower limit inside an upper one as one node', () => {
    const inner = `<m:limUpp><m:e><m:limLow><m:e>${r('x')}</m:e><m:lim>${r('a')}</m:lim></m:limLow></m:e><m:lim>${r('b')}</m:lim></m:limUpp>`;
    expect(readOmml(oMath(inner))).toEqual([
      { kind: 'under-over', base: [id('x')], under: [id('a')], over: [id('b')] },
    ]);
  });

  it.each([
    ['a matrix', `<m:m><m:mr><m:e>${r('a')}</m:e></m:mr></m:m>`],
    ['an equation array', `<m:eqArr><m:e>${r('a')}</m:e></m:eqArr>`],
    ['a bold letter', r('a', '<m:rPr><m:sty m:val="b"/></m:rPr>')],
    ['a script letter', r('a', '<m:rPr><m:scr m:val="script"/></m:rPr>')],
    ['a fence of two arguments', `<m:d><m:e>${r('a')}</m:e><m:e>${r('b')}</m:e></m:d>`],
    [
      'a skewed fraction',
      `<m:f><m:fPr><m:type m:val="skw"/></m:fPr><m:num>${r('a')}</m:num><m:den>${r('b')}</m:den></m:f>`,
    ],
    ['a tracked change', `<w:ins>${r('a')}</w:ins>`],
  ])('keeps an equation holding %s', (_, inner) => {
    expect(readOmml(oMath(inner))).toBeUndefined();
  });
});

describe('OMML written', () => {
  const ROW: MathRow = [
    { kind: 'fraction', numerator: [id('a')], denominator: [id('b'), op('+'), num('1.5')] },
    { kind: 'scripts', base: [id('x')], sub: [num('1')], sup: [num('2')] },
    { kind: 'scripts', base: [id('x')], sup: [num('2')] },
    { kind: 'scripts', base: [id('y')], sub: [id('i')] },
    { kind: 'root', radicand: [id('z')] },
    { kind: 'root', radicand: [id('z')], index: [num('3')] },
    { kind: 'large-operator', operator: '∑', lower: [id('a')], upper: [id('b')], body: [id('k')] },
    { kind: 'large-operator', operator: '∫', lower: [num('0')], upper: [], body: [id('f')] },
    { kind: 'fence', open: '(', close: '', body: [id('p')] },
    { kind: 'accent', base: [id('v')], accent: '→' },
    { kind: 'under-over', base: [id('lim')], under: [id('a')], over: [id('b')] },
    { kind: 'under-over', base: [id('x')], over: [id('b')] },
    { kind: 'text', text: 'a < b' },
    id('sin'),
  ];

  it('reads back as it was written, every node', () => {
    const parsed = parseXml(ommlXml(ROW, '').replace('<m:oMath ', `<m:oMath xmlns:w="${W_NS}" `));
    expect(parsed.ok && readOmml(parsed.root)).toEqual(ROW);
  });

  it('writes each token its own run, in the run formatting given', () => {
    const xml = ommlXml(
      [id('sin'), { kind: 'text', text: 'if' }, num('2')],
      '<w:rPr><w:sz w:val="28"/></w:rPr>',
    );
    expect(xml).toBe(
      `<m:oMath xmlns:m="${M_NS}">` +
        '<m:r><m:rPr><m:sty m:val="p"/></m:rPr><w:rPr><w:sz w:val="28"/></w:rPr><m:t xml:space="preserve">sin</m:t></m:r>' +
        '<m:r><m:rPr><m:nor/></m:rPr><w:rPr><w:sz w:val="28"/></w:rPr><m:t xml:space="preserve">if</m:t></m:r>' +
        '<m:r><w:rPr><w:sz w:val="28"/></w:rPr><m:t xml:space="preserve">2</m:t></m:r></m:oMath>',
    );
  });

  it('writes an integral with its limits beside it and hides an empty one', () => {
    const xml = ommlXml(ROW.slice(7, 8), '');
    expect(xml).toContain('<m:chr m:val="∫"/><m:limLoc m:val="subSup"/><m:supHide m:val="1"/>');
  });
});

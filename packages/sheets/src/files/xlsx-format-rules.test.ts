// Format rules in XLSX (docs/specs/029-sheets/standard-mapping.md "Format rules in the file", D215): each condition,
// operand and scale point read and written, differential formats as styles, rules the model does not hold kept and
// written back before LiveDoc's own, and the kept differential formats' ids standing.
import { parseXml, readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { FORMAT_RULES_MAX, FORMAT_RULE_RANGES_MAX } from '../limits';
import type { FileFormatRule } from './file-format-rules';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';
import { XlsxStyles } from './xlsx-styles';
import { SPREADSHEETML_NS } from './xlsx-parts';
import {
  dxfXml,
  readSqref,
  readXlsxDxfs,
  readXlsxFormatRules,
  xlsxFormatRulesXml,
  type XlsxDxf,
} from './xlsx-format-rules';
import type { WorkbookFile } from './workbook-file';

const RED = { bg: '#f4c7c3', fc: '#a50e0e' };
const at = (r1: number, c1: number, r2 = r1, c2 = c1) => ({ r1, c1, r2, c2 });
const when = (x: Partial<FileFormatRule>): FileFormatRule => ({
  ranges: [at(0, 0, 9, 0)],
  is: 'when',
  style: RED,
  ...x,
});

// A worksheet's rules read from its XML, every dxf the style `RED` but the second, which says nothing.
function rulesOf(
  xml: string,
  dxfs: XlsxDxf[] = [
    { style: RED, extra: false },
    { style: {}, extra: false },
  ],
) {
  const parsed = parseXml(`<worksheet xmlns="${SPREADSHEETML_NS}">${xml}</worksheet>`);
  if (!parsed.ok) throw new Error('xml');
  return readXlsxFormatRules(parsed.root, SPREADSHEETML_NS, dxfs, ['#ffffff']);
}
const cf = (sqref: string, rules: string) =>
  `<conditionalFormatting sqref="${sqref}">${rules}</conditionalFormatting>`;
const rule = (attrs: string, body = '') => `<cfRule dxfId="0" ${attrs}>${body}</cfRule>`;
const f = (text: string) => `<formula>${text}</formula>`;

describe('reading rules', () => {
  it('reads each condition Excel and LibreOffice write', () => {
    const read = rulesOf(
      cf(
        'A1:A10 C2',
        rule('type="cellIs" priority="1" operator="greaterThan"', f('10')) +
          rule('type="cellIs" priority="2" operator="between"', f('-1.5') + f('3')) +
          rule('type="cellIs" priority="3" operator="equal"', f('"a""b"')) +
          rule('type="containsText" priority="4" operator="containsText" text="ab"', f('x')) +
          rule('type="notContainsText" priority="5" text="q"') +
          rule('type="beginsWith" priority="6" text="x"') +
          rule('type="endsWith" priority="7" text="y"') +
          rule('type="containsBlanks" priority="8"') +
          rule('type="notContainsBlanks" priority="9"') +
          rule('type="expression" priority="10"', f('LEN(TRIM(A1))=0')) +
          rule('type="expression" priority="11"', f('LEN( TRIM(A1) )&gt;0')) +
          rule('type="expression" priority="12"', f('$B1&gt;_xlfn.XOR(1,0)')),
      ),
    );
    expect(read.rules.map((x) => [x.op, x.a, x.b, x.formula])).toEqual([
      ['gt', 10, undefined, undefined],
      ['between', -1.5, 3, undefined],
      ['eq', 'a"b', undefined, undefined],
      ['contains', 'ab', undefined, undefined],
      ['notContains', 'q', undefined, undefined],
      ['startsWith', 'x', undefined, undefined],
      ['endsWith', 'y', undefined, undefined],
      ['empty', undefined, undefined, undefined],
      ['notEmpty', undefined, undefined, undefined],
      ['empty', undefined, undefined, undefined],
      ['notEmpty', undefined, undefined, undefined],
      ['formula', undefined, undefined, '=$B1>XOR(1,0)'],
    ]);
    expect(read.rules[0]).toMatchObject({ ranges: [at(0, 0, 9, 0), at(1, 2)], style: RED });
    expect(read.read.size).toBe(12);
    expect(read.styled).toBe(false);
  });
  it('reads a comparison it cannot hold as the same test written as a formula', () => {
    const read = rulesOf(
      cf(
        'B2:B5',
        rule('type="cellIs" priority="1" operator="lessThan"', f('$C$1')) +
          rule('type="cellIs" priority="2" operator="notBetween"', f('1') + f('C1')) +
          rule('type="cellIs" priority="3" operator="between"', f('1') + f('C1')) +
          rule('type="cellIs" priority="4" operator="greaterThan"', f('"m"')) +
          rule('type="cellIs" priority="5" operator="notEqual"', f('C1')) +
          rule('type="cellIs" priority="6" operator="equal"', f(`"${'x'.repeat(256)}"`)),
      ),
    );
    expect(read.rules.map((x) => x.formula)).toEqual([
      '=B2<$C$1',
      '=NOT(OR(AND(B2>=1,B2<=C1),AND(B2>=C1,B2<=1)))',
      '=OR(AND(B2>=1,B2<=C1),AND(B2>=C1,B2<=1))',
      '=B2>"m"',
      '=B2<>C1',
      `=B2="${'x'.repeat(256)}"`,
    ]);
  });
  it('reads Is Not Between of two numbers as itself', () => {
    const read = rulesOf(
      cf('B2:B5', rule('type="cellIs" priority="1" operator="notBetween"', f('1') + f('5'))),
    );
    expect(read.rules[0]).toMatchObject({ op: 'notBetween', a: 1, b: 5 });
  });
  it('leaves unread what the model does not hold', () => {
    const long = 'x'.repeat(256);
    const read = rulesOf(
      cf('A1', rule('type="top10" priority="1" rank="10"')) +
        cf('A1', rule('type="cellIs" priority="2" operator="greaterThan"')) +
        cf('A1', rule('type="cellIs" priority="3" operator="between"', f('1'))) +
        cf('A1', rule('type="cellIs" priority="4" operator="nope"', f('A2'))) +
        cf('A1', rule(`type="containsText" priority="6" text="${long}"`)) +
        cf('A1', rule('type="containsText" priority="7"')) +
        cf('A1', rule('type="expression" priority="8"')) +
        cf('A1', rule('type="expression" priority="9"', f('SUM(('))) +
        cf('A1', rule('type="expression" priority="10"', f('1'.repeat(1001)))) +
        cf(
          'A1',
          '<cfRule type="cellIs" dxfId="1" priority="11" stopIfTrue="1" operator="equal"><formula>1</formula></cfRule>',
        ) +
        cf(
          'A1',
          '<cfRule type="cellIs" dxfId="7" priority="12" stopIfTrue="1" operator="equal"><formula>1</formula></cfRule>',
        ) +
        cf('nope', rule('type="containsBlanks" priority="13"')) +
        cf(
          Array(FORMAT_RULE_RANGES_MAX + 1)
            .fill('A1')
            .join(' '),
          rule('type="containsBlanks"'),
        ) +
        cf('A1', '<cfRule dxfId="0" priority="14"/>') +
        cf('A1', rule('type="cellIs" priority="15"', f('1'))) +
        cf(
          'A1',
          '<cfRule type="colorScale"><colorScale><cfvo/><cfvo type="max"/><color rgb="FFFFFFFF"/><color rgb="FFFFFFFF"/></colorScale></cfRule>',
        ) +
        '<conditionalFormatting><cfRule type="containsBlanks" dxfId="0"/></conditionalFormatting>' +
        '<other/><conditionalFormatting sqref="A1"><other/></conditionalFormatting>',
    );
    expect(read.rules).toEqual([]);
  });
  it('orders by priority, the file\u2019s order among equals and none last, up to the limit', () => {
    const read = rulesOf(
      cf('A1', rule('type="containsText" text="none"')) +
        cf('A1', rule('type="containsText" priority="2" text="b"')) +
        cf('A1', rule('type="containsText" priority="1" text="a"')) +
        cf('A1', rule('type="containsText" priority="2" text="c"')),
    );
    expect(read.rules.map((x) => x.a)).toEqual(['a', 'b', 'c', 'none']);
    const many = rulesOf(
      Array.from({ length: FORMAT_RULES_MAX + 1 }, (_, i) =>
        cf('A1', rule(`type="containsBlanks" priority="${i + 1}"`)),
      ).join(''),
    );
    expect(many.rules).toHaveLength(FORMAT_RULES_MAX);
  });
  it('reads colour scales of two and three points, and leaves one it cannot hold', () => {
    const scale = (cfvos: string, colours: string) =>
      cf(
        'D1:D9',
        `<cfRule type="colorScale" priority="1"><colorScale>${cfvos}${colours}</colorScale></cfRule>`,
      );
    const c = (rgb: string) => `<color rgb="${rgb}"/>`;
    const v = (type: string, val?: string) => `<cfvo type="${type}"${val ? ` val="${val}"` : ''}/>`;
    const three = rulesOf(
      scale(
        v('min', '0') + v('percentile', '50') + v('num', '100'),
        c('FFF8696B') + c('FFFFEB84') + '<color theme="0"/>',
      ),
    );
    expect(three.rules[0]).toEqual({
      ranges: [at(0, 3, 8, 3)],
      is: 'scale',
      min: { c: '#f8696b', at: 'min' },
      mid: { c: '#ffeb84', at: 'pctile', v: 50 },
      max: { c: '#ffffff', at: 'num', v: 100 },
    });
    const two = rulesOf(scale(v('percent', '10') + v('max'), c('FFFFFFFF') + c('FF57BB8A')));
    expect(two.rules[0]).toMatchObject({ min: { at: 'pct', v: 10 }, max: { at: 'max' } });
    expect(two.rules[0]!.mid).toBeUndefined();
    for (const bad of [
      scale(v('min'), c('FFFFFFFF')),
      scale(v('min') + v('max'), c('FFFFFFFF')),
      scale(v('formula', 'A1') + v('max'), c('FFFFFFFF') + c('FFFFFFFF')),
      scale(v('max') + v('max'), c('FFFFFFFF') + c('FFFFFFFF')),
      scale(v('min') + v('min'), c('FFFFFFFF') + c('FFFFFFFF')),
      scale(v('num', 'x') + v('max'), c('FFFFFFFF') + c('FFFFFFFF')),
      scale(v('percent', '101') + v('max'), c('FFFFFFFF') + c('FFFFFFFF')),
      scale(v('min') + v('max'), c('FFFFFFFF') + '<color auto="1"/>'),
      cf('A1', '<cfRule type="colorScale" priority="1"/>'),
    ])
      expect(rulesOf(bad).rules).toEqual([]);
  });
  it('names a style that says more than a rule holds', () => {
    expect(
      rulesOf(cf('A1', rule('type="containsBlanks"')), [{ style: RED, extra: true }]).styled,
    ).toBe(true);
  });
  it('reads a range of single cells and ranges either way round', () => {
    expect(readSqref(' B3:A1  C5 ')).toEqual([at(0, 0, 2, 1), at(4, 2)]);
    expect(readSqref('A1:nope')).toBeNull();
  });
});

describe('differential formats', () => {
  const styles = (dxfs: string) =>
    `<styleSheet xmlns="${SPREADSHEETML_NS}"><dxfs count="9">${dxfs}</dxfs></styleSheet>`;
  it('reads font and fill as a style, naming what it says beyond', () => {
    const read = readXlsxDxfs(
      styles(
        '<dxf><font><b/><i val="1"/><u val="double"/><strike/><color rgb="FF9C0006"/><name val="Arial"/><family val="2"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf>' +
          '<dxf><font><b val="0"/><sz val="14"/><outline/></font><fill><patternFill patternType="solid"><fgColor rgb="FF00FF00"/></patternFill></fill><border/></dxf>' +
          '<dxf><fill><patternFill patternType="gray125"><bgColor rgb="FF000000"/></patternFill></fill><numFmt numFmtId="1" formatCode="0"/></dxf>' +
          '<dxf><fill><patternFill patternType="none"><bgColor rgb="FF000000"/></patternFill></fill><border/></dxf>' +
          '<dxf><fill/><border><left/></border><other xmlns="urn:x"/></dxf>' +
          '<other/>',
      ),
    );
    expect(read).toEqual([
      {
        style: { b: true, i: true, u: true, st: true, fc: '#9c0006', bg: '#ffc7ce' },
        extra: false,
      },
      { style: { bg: '#00ff00' }, extra: true },
      { style: { bg: '#000000' }, extra: true },
      { style: {}, extra: false },
      { style: {}, extra: true },
    ]);
    expect(readXlsxDxfs(undefined)).toEqual([]);
    expect(readXlsxDxfs('<nope')).toEqual([]);
    expect(readXlsxDxfs(`<styleSheet xmlns="${SPREADSHEETML_NS}"/>`)).toEqual([]);
    expect(
      readXlsxDxfs(
        '<styleSheet xmlns="http://purl.oclc.org/ooxml/spreadsheetml/main"><dxfs><dxf><font><b/></font></dxf></dxfs></styleSheet>',
      ),
    ).toEqual([{ style: { b: true }, extra: false }]);
  });
  it('writes a style as one, after the kept ones, merged into their list', () => {
    expect(dxfXml({ b: true, i: true, st: true, u: true, fc: '#123456', bg: '#abcdef' })).toBe(
      '<dxf><font><b/><i/><strike/><u/><color rgb="FF123456"/></font><fill><patternFill><bgColor rgb="FFABCDEF"/></patternFill></fill></dxf>',
    );
    expect(dxfXml({})).toBe('<dxf></dxf>');
    const none = new XlsxStyles('<tableStyles count="0"/>');
    expect(none.xml()).toContain('</cellStyles><tableStyles count="0"/></styleSheet>');
    const own = new XlsxStyles('<tableStyles count="0"/>');
    expect([own.dxf({ b: true }), own.dxf({ i: true }), own.dxf({ b: true })]).toEqual([0, 1, 0]);
    expect(own.xml()).toContain(
      '<dxfs count="2"><dxf><font><b/></font></dxf><dxf><font><i/></font></dxf></dxfs><tableStyles',
    );
    const merged = new XlsxStyles('<dxfs count="1"><dxf><font><u/></font></dxf></dxfs>');
    expect(merged.dxf({ b: true })).toBe(1);
    expect(merged.xml()).toContain(
      '<dxfs count="2"><dxf><font><u/></font></dxf><dxf><font><b/></font></dxf></dxfs>',
    );
    const empty = new XlsxStyles('<dxfs count="0"/>');
    expect(empty.dxf({ b: true })).toBe(0);
    expect(empty.xml()).toContain('<dxfs count="1"><dxf><font><b/></font></dxf></dxfs>');
    const prefixed = new XlsxStyles('<x:dxfs count="1"><x:dxf/></x:dxfs>');
    expect(prefixed.dxf({ b: true })).toBe(1);
    expect(prefixed.xml()).toContain(
      '<x:dxfs count="2"><x:dxf/><x:dxf><x:font><x:b/></x:font></x:dxf></x:dxfs>',
    );
  });
});

describe('writing rules', () => {
  const written = (rules: FileFormatRule[], first = 1) =>
    xlsxFormatRulesXml(rules, first, (s) => (s.b ? 1 : 0), new Map([['Old', 'New']]))
      .map((x) => x.xml)
      .join('\n');
  it('writes Is Not Between as itself', () => {
    expect(written([when({ op: 'notBetween', a: 1, b: 5 })])).toBe(
      '<conditionalFormatting sqref="A1:A10"><cfRule type="cellIs" dxfId="0" priority="1" stopIfTrue="1" operator="notBetween"><formula>1</formula><formula>5</formula></cfRule></conditionalFormatting>',
    );
  });
  it('writes each condition with its operands and the anchor in its formulas', () => {
    const xml = written(
      [
        when({ ranges: [at(1, 0, 9, 0), at(0, 2)], op: 'gt', a: 10 }),
        when({ op: 'between', a: 1, b: 'x"y' }),
        when({ op: 'contains', a: 'a&b' }),
        when({ op: 'notContains', a: 'q' }),
        when({ op: 'startsWith', a: 's' }),
        when({ op: 'endsWith', a: 'e' }),
        when({ op: 'empty' }),
        when({ op: 'notEmpty', style: { b: true } }),
        when({ op: 'formula', formula: '=Old!$B1<2' }),
        when({ op: 'formula', formula: '=QUERY(A1:B2,"select A")' }),
      ],
      5,
    );
    expect(xml.split('\n')).toEqual([
      '<conditionalFormatting sqref="A2:A10 C1"><cfRule type="cellIs" dxfId="0" priority="5" stopIfTrue="1" operator="greaterThan"><formula>10</formula></cfRule></conditionalFormatting>',
      '<conditionalFormatting sqref="A1:A10"><cfRule type="cellIs" dxfId="0" priority="6" stopIfTrue="1" operator="between"><formula>1</formula><formula>"x""y"</formula></cfRule></conditionalFormatting>',
      '<conditionalFormatting sqref="A1:A10"><cfRule type="containsText" dxfId="0" priority="7" stopIfTrue="1" operator="containsText" text="a&amp;b"><formula>NOT(ISERROR(SEARCH("a&amp;b",A1)))</formula></cfRule></conditionalFormatting>',
      '<conditionalFormatting sqref="A1:A10"><cfRule type="notContainsText" dxfId="0" priority="8" stopIfTrue="1" operator="notContains" text="q"><formula>ISERROR(SEARCH("q",A1))</formula></cfRule></conditionalFormatting>',
      '<conditionalFormatting sqref="A1:A10"><cfRule type="beginsWith" dxfId="0" priority="9" stopIfTrue="1" operator="beginsWith" text="s"><formula>LEFT(A1,LEN("s"))="s"</formula></cfRule></conditionalFormatting>',
      '<conditionalFormatting sqref="A1:A10"><cfRule type="endsWith" dxfId="0" priority="10" stopIfTrue="1" operator="endsWith" text="e"><formula>RIGHT(A1,LEN("e"))="e"</formula></cfRule></conditionalFormatting>',
      '<conditionalFormatting sqref="A1:A10"><cfRule type="containsBlanks" dxfId="0" priority="11" stopIfTrue="1"><formula>LEN(TRIM(A1))=0</formula></cfRule></conditionalFormatting>',
      '<conditionalFormatting sqref="A1:A10"><cfRule type="notContainsBlanks" dxfId="1" priority="12" stopIfTrue="1"><formula>LEN(TRIM(A1))&gt;0</formula></cfRule></conditionalFormatting>',
      '<conditionalFormatting sqref="A1:A10"><cfRule type="expression" dxfId="0" priority="13" stopIfTrue="1"><formula>New!$B1&lt;2</formula></cfRule></conditionalFormatting>',
      '<conditionalFormatting sqref="A1:A10"><cfRule type="expression" dxfId="0" priority="14" stopIfTrue="1"><formula>IFERROR(__xludf.DUMMYFUNCTION("QUERY(A1:B2,""select A"")"),FALSE)</formula></cfRule></conditionalFormatting>',
    ]);
  });
  it('writes scales, cuts ranges at Excel\u2019s last column and moves a formula with its anchor', () => {
    const xml = written([
      {
        ranges: [at(0, 3, 9, 3)],
        is: 'scale',
        min: { c: '#ffffff', at: 'min' },
        mid: { c: '#808080', at: 'pctile', v: 50 },
        max: { c: '#000000', at: 'num', v: 7 },
      },
      when({ ranges: [at(0, 16_384, 3, 16_390)] }),
      when({ ranges: [at(0, 16_384), at(4, 1, 5, 16_400)], op: 'formula', formula: '=$C1>0' }),
    ]);
    expect(xml.split('\n')).toEqual([
      '<conditionalFormatting sqref="D1:D10"><cfRule type="colorScale" priority="1"><colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="num" val="7"/><color rgb="FFFFFFFF"/><color rgb="FF808080"/><color rgb="FF000000"/></colorScale></cfRule></conditionalFormatting>',
      '<conditionalFormatting sqref="B5:XFD6"><cfRule type="expression" dxfId="0" priority="2" stopIfTrue="1"><formula>$C5&gt;0</formula></cfRule></conditionalFormatting>',
    ]);
    expect(written([])).toBe('');
    expect(xlsxFormatRulesXml(undefined, 1, () => 0, new Map())).toEqual([]);
  });
});

describe('through a file', () => {
  const book = (formatRules: FileFormatRule[]): WorkbookFile => ({
    sheets: [
      {
        name: 'Data',
        rows: 3,
        cols: 3,
        cells: [{ r: 0, c: 0, value: { k: 'n', v: 5 } }],
        formatRules,
      },
    ],
  });
  async function roundTrip(file: WorkbookFile) {
    const out = writeXlsx(file, 'T');
    const read = await readXlsx(out.data);
    if (!read.ok) throw new Error(read.rejection);
    return { out, read };
  }
  it('reads back what it writes, the kept rules kept and first, and the kept formats\u2019 ids standing', async () => {
    const rules = [
      when({ op: 'gt', a: 1 }),
      when({ op: 'contains', a: 'x', style: { b: true } }),
      {
        ranges: [at(0, 1, 2, 1)],
        is: 'scale' as const,
        min: { c: '#ffffff', at: 'min' as const },
        max: { c: '#57bb8a', at: 'max' as const },
      },
    ];
    const first = await roundTrip(book(rules));
    expect(first.read.file.sheets[0]!.formatRules).toEqual(rules);
    expect(first.read.file.kept).toBeUndefined();
    // A file whose kept rule names the kept format 0, and whose rule LiveDoc reads names format 1.
    const kept = {
      standard: 'ooxml' as const,
      items: [
        {
          place: 'stylesheet' as const,
          xml: '<dxfs count="2"><dxf><font><u/></font></dxf><dxf><font><i/></font></dxf></dxfs>',
          ns: {},
          at: {},
        },
        {
          place: 'worksheet' as const,
          xml: '<conditionalFormatting sqref="C1"><cfRule type="top10" dxfId="0" priority="3" stopIfTrue="1" rank="1"/><cfRule type="containsBlanks" dxfId="1" priority="4"/></conditionalFormatting>',
          ns: {},
          at: { sheet: 0 },
        },
      ],
      parts: [],
      relationships: [],
    };
    const second = await roundTrip({ ...book(rules), kept });
    const pkg = await readOoxmlPackage(second.out.data);
    if (!pkg.ok) throw new Error('pkg');
    const sheet = new TextDecoder().decode(pkg.package.parts.get('xl/worksheets/sheet1.xml'));
    expect(sheet).toContain(
      '<cfRule type="cellIs" dxfId="2" priority="5" stopIfTrue="1" operator="greaterThan">',
    );
    // The kept containsBlanks rule is read now; the top 10 stays the file's, with the format it names.
    const read = second.read.file;
    expect(read.sheets[0]!.formatRules!.map((x) => x.op)).toEqual([
      'empty',
      'gt',
      'contains',
      undefined,
    ]);
    expect(read.kept!.items.map((x) => x.xml)).toEqual(
      expect.arrayContaining([
        '<dxfs count="1"><dxf><font><u/></font></dxf></dxfs>',
        '<conditionalFormatting sqref="C1"><cfRule type="top10" dxfId="0" priority="3" stopIfTrue="1" rank="1"/></conditionalFormatting>',
      ]),
    );
  });
  it('names a sheet whose rule style says more than a style holds', async () => {
    const { read } = await roundTrip({
      ...book([]),
      kept: {
        standard: 'ooxml',
        items: [
          {
            place: 'stylesheet',
            xml: '<dxfs count="1"><dxf><font><b/></font><numFmt numFmtId="1" formatCode="0"/></dxf></dxfs>',
            ns: {},
            at: {},
          },
          {
            place: 'worksheet',
            xml: '<conditionalFormatting sqref="C1"><cfRule type="containsBlanks" dxfId="0" priority="1"/></conditionalFormatting>',
            ns: {},
            at: { sheet: 0 },
          },
        ],
        parts: [],
        relationships: [],
      },
    });
    expect(read.losses).toContainEqual({ k: 'styles_unread', sheet: 'Data' });
    expect(read.file.sheets[0]!.formatRules).toHaveLength(1);
  });
});

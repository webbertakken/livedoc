// Format rules in ODF (docs/specs/029-sheets/standard-mapping.md "Format rules in the file", D215): LibreOffice's
// conditions and colour scales read and written, named cell styles as a rule's style, conditions the model does not
// hold kept with their styles and written back first, in one `calcext:conditional-formats`.
import { childElements, ODF_NS, parseXml } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { FORMAT_RULES_MAX, FORMAT_RULE_RANGES_MAX } from '../limits';
import type { FileFormatRule } from './file-format-rules';
import { odsCellLooks } from './ods-cell-style';
import {
  odfCondition,
  odsFormatRulesXml,
  readOdfRanges,
  readOdsFormatRules,
  unreadStyleNames,
} from './ods-format-rules';
import { readOds } from './ods-read';
import { writeFlatOds, writeOds } from './ods-write';
import type { WorkbookFile } from './workbook-file';

const NS = Object.entries(ODF_NS)
  .map(([p, uri]) => `xmlns:${p}="${uri}"`)
  .join(' ');
const RED = { bg: '#f4c7c3', fc: '#a50e0e' };
const at = (r1: number, c1: number, r2 = r1, c2 = c1) => ({ r1, c1, r2, c2 });
const STYLES =
  '<office:styles>' +
  '<style:style style:name="Default" style:family="table-cell"><style:text-properties style:font-name="Liberation Sans"/></style:style>' +
  '<style:style style:name="Bad_5f_1" style:display-name="Bad_1" style:family="table-cell" style:parent-style-name="Default">' +
  '<style:table-cell-properties fo:background-color="#f4c7c3"/><style:text-properties fo:color="#a50e0e" fo:font-name="Liberation Sans"/></style:style>' +
  '<style:style style:name="Plain" style:family="table-cell" style:parent-style-name="Default"/>' +
  '<style:style style:name="Wide" style:family="table-cell"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-weight="bold"/></style:style>' +
  '</office:styles>';

function rulesOf(formats: string) {
  const parsed = parseXml(
    `<office:document ${NS}>${STYLES}<table:table table:name="S"><calcext:conditional-formats>${formats}</calcext:conditional-formats></table:table></office:document>`,
  );
  if (!parsed.ok) throw new Error('xml');
  const table = childElements(parsed.root).find((n) => n.local === 'table')!;
  return { read: readOdsFormatRules(table, odsCellLooks([parsed.root])), table };
}
const format = (target: string, inner: string) =>
  `<calcext:conditional-format calcext:target-range-address="${target}">${inner}</calcext:conditional-format>`;
const condition = (value: string, style = 'Bad_1', base = 'S.A1') =>
  `<calcext:condition calcext:apply-style-name="${style}" calcext:value="${value}" calcext:base-cell-address="${base}"/>`;

describe('ranges', () => {
  it('reads sheet-qualified ranges, quoted names and single cells', () => {
    expect(readOdfRanges("S.A1:S.A10 'My ''x'' sheet'.$C$2 .B3:.B1")).toEqual([
      at(0, 0, 9, 0),
      at(1, 2),
      at(0, 1, 2, 1),
    ]);
    for (const bad of ['', 'S.A1:S.B2:S.C3', 'S.nope']) expect(readOdfRanges(bad)).toBeNull();
  });
});

describe('conditions', () => {
  const read = (value: string, base = { dr: 0, dc: 0 }) =>
    odfCondition(value, { r: 1, c: 1 }, base);
  it('reads comparisons with numbers or text, and the text tests', () => {
    expect(read('&gt;10'.replace('&gt;', '>'))).toEqual({ op: 'gt', a: 10 });
    expect(read('>=-1.5')).toEqual({ op: 'gte', a: -1.5 });
    expect(read('<2')).toEqual({ op: 'lt', a: 2 });
    expect(read('<=2')).toEqual({ op: 'lte', a: 2 });
    expect(read('="a""b"')).toEqual({ op: 'eq', a: 'a"b' });
    expect(read('!=3')).toEqual({ op: 'neq', a: 3 });
    expect(read('between(1,3)')).toEqual({ op: 'between', a: 1, b: 3 });
    expect(read('contains-text("ab")')).toEqual({ op: 'contains', a: 'ab' });
    expect(read('not-contains-text("q")')).toEqual({ op: 'notContains', a: 'q' });
    expect(read('begins-with("x")')).toEqual({ op: 'startsWith', a: 'x' });
    expect(read('ends-with("y")')).toEqual({ op: 'endsWith', a: 'y' });
    expect(read('formula-is(LEN(TRIM([.B2]))=0)')).toEqual({ op: 'empty' });
    expect(read('formula-is(LEN(TRIM([.B2]))>0)')).toEqual({ op: 'notEmpty' });
  });
  it('reads what it cannot hold as a formula, moved from its base cell', () => {
    expect(read('formula-is([.$A1]>20)', { dr: 1, dc: 0 })).toEqual({
      op: 'formula',
      formula: '=$A2>20',
    });
    expect(read('<[.$C$1]')).toEqual({ op: 'formula', formula: '=B2<$C$1' });
    expect(read('>"m"')).toEqual({ op: 'formula', formula: '=B2>"m"' });
    expect(read(`=${'"' + 'x'.repeat(256) + '"'}`)).toEqual({
      op: 'formula',
      formula: `=B2="${'x'.repeat(256)}"`,
    });
    expect(read('between(1;[.C1])')).toEqual({
      op: 'formula',
      formula: '=OR(AND(B2>=1,B2<=C1),AND(B2>=C1,B2<=1))',
    });
    expect(read('not-between(1,5)')).toEqual({
      op: 'formula',
      formula: '=NOT(OR(AND(B2>=1,B2<=5),AND(B2>=5,B2<=1)))',
    });
  });
  it('reads nothing it does not know', () => {
    for (const value of [
      'duplicate',
      'is-error',
      'top-elements(10)',
      'formula-is(SUM(()',
      `formula-is(${'1'.repeat(1001)})`,
      'contains-text([.A1])',
      `contains-text("${'x'.repeat(256)}")`,
      'between(1)',
      'between(1,SUM(()',
      'contains-text("a","b")',
      '>SUM((',
      'nope',
    ])
      expect(read(value)).toBeNull();
  });
});

describe('reading a table\u2019s rules', () => {
  it('reads conditions with their styles and scales, in file order', () => {
    const { read } = rulesOf(
      format(
        'S.A1:S.A10 S.C1',
        condition('&gt;10') + condition('contains-text(&quot;a&quot;)', 'Bad_5f_1'),
      ) +
        format(
          'S.D1:S.D9',
          '<calcext:color-scale>' +
            '<calcext:color-scale-entry calcext:value="0" calcext:type="minimum" calcext:color="#F8696B"/>' +
            '<calcext:color-scale-entry calcext:value="50" calcext:type="percentile" calcext:color="#ffeb84"/>' +
            '<calcext:color-scale-entry calcext:value="100" calcext:type="number" calcext:color="#63be7b"/>' +
            '</calcext:color-scale>',
        ) +
        format(
          'S.E1',
          '<calcext:color-scale><calcext:color-scale-entry calcext:value="10" calcext:type="percent" calcext:color="#ffffff"/>' +
            '<calcext:color-scale-entry calcext:type="maximum" calcext:color="#57bb8a"/></calcext:color-scale>',
        ),
    );
    expect(read.rules).toEqual([
      { ranges: [at(0, 0, 9, 0), at(0, 2)], is: 'when', op: 'gt', a: 10, style: RED },
      { ranges: [at(0, 0, 9, 0), at(0, 2)], is: 'when', op: 'contains', a: 'a', style: RED },
      {
        ranges: [at(0, 3, 8, 3)],
        is: 'scale',
        min: { c: '#f8696b', at: 'min' },
        mid: { c: '#ffeb84', at: 'pctile', v: 50 },
        max: { c: '#63be7b', at: 'num', v: 100 },
      },
      {
        ranges: [at(0, 4)],
        is: 'scale',
        min: { c: '#ffffff', at: 'pct', v: 10 },
        max: { c: '#57bb8a', at: 'max' },
      },
    ]);
    expect(read.read.size).toBe(4);
    expect(read.styled).toBe(false);
  });
  it('leaves unread what it cannot hold, and names the styles they use', () => {
    const entry = (type: string, value = '0', colour = '#ffffff') =>
      `<calcext:color-scale-entry calcext:value="${value}" calcext:type="${type}" calcext:color="${colour}"/>`;
    const scale = (...entries: string[]) =>
      `<calcext:color-scale>${entries.join('')}</calcext:color-scale>`;
    const { read, table } = rulesOf(
      format('S.A1', condition('duplicate', 'Wide')) +
        format('S.A1', condition('&gt;1', 'Plain')) +
        format('S.A1', condition('&gt;1', 'Nowhere')) +
        format('S.A1', '<calcext:data-bar/><other xmlns="urn:x"/>') +
        format('S.A1', scale(entry('minimum'))) +
        format('S.A1', scale('<calcext:color-scale-entry/>', entry('maximum'))) +
        format(
          'S.A1',
          '<calcext:condition calcext:value="&gt;1"/><calcext:condition calcext:apply-style-name="Bad_1"/>',
        ) +
        format('S.A1', scale(entry('formula'), entry('maximum'))) +
        format('S.A1', scale(entry('maximum'), entry('maximum'))) +
        format('S.A1', scale(entry('minimum'), entry('minimum'))) +
        format('S.A1', scale(entry('number', 'x'), entry('maximum'))) +
        format('S.A1', scale(entry('percent', '101'), entry('maximum'))) +
        format('S.A1', scale(entry('minimum'), entry('maximum', '0', 'red'))) +
        format('nope', condition('&gt;1')) +
        format(
          Array(FORMAT_RULE_RANGES_MAX + 1)
            .fill('S.A1')
            .join(' '),
          condition('&gt;1'),
        ) +
        '<calcext:conditional-format/><other xmlns="urn:x"/>',
    );
    expect(read.rules).toEqual([]);
    expect(unreadStyleNames(table, read.read)).toEqual([
      'Wide',
      'Plain',
      'Nowhere',
      'Bad_1',
      'Bad_1',
      'Bad_1',
    ]);
    // A condition with no base cell is written for its anchor.
    const noBase = '<calcext:condition calcext:apply-style-name="Bad_1" calcext:value="&gt;1"/>';
    expect(rulesOf(format('S.B2', noBase)).read.rules).toHaveLength(1);
  });
  it('names a style that says more than a rule holds, and stops at the limit', () => {
    expect(rulesOf(format('S.A1', condition('&gt;1', 'Wide'))).read.styled).toBe(true);
    const many = rulesOf(
      format(
        'S.A1',
        Array.from({ length: FORMAT_RULES_MAX + 1 }, () => condition('&gt;1')).join(''),
      ),
    );
    expect(many.read.rules).toHaveLength(FORMAT_RULES_MAX);
  });
  it('reads a table with none', () => {
    const parsed = parseXml(`<table:table ${NS}/>`);
    if (!parsed.ok) throw new Error('xml');
    expect(readOdsFormatRules(parsed.root, odsCellLooks([])).rules).toEqual([]);
    expect(unreadStyleNames(parsed.root, new Set())).toEqual([]);
  });
});

describe('writing rules', () => {
  const when = (x: Partial<FileFormatRule>): FileFormatRule => ({
    ranges: [at(0, 0, 9, 0)],
    is: 'when',
    style: RED,
    ...x,
  });
  it('writes each condition, its style named, for the anchor of a sheet quoted as needed', () => {
    const xml = odsFormatRulesXml(
      [
        when({ ranges: [at(1, 0, 9, 0), at(0, 2)], op: 'gt', a: 10 }),
        when({ op: 'neq', a: 'x"y' }),
        when({ op: 'between', a: 1, b: 3 }),
        when({ op: 'contains', a: 'a' }),
        when({ op: 'empty' }),
        when({ op: 'notEmpty' }),
        when({ op: 'formula', formula: "='Other sheet'!$B1<2" }),
        when({ op: 'formula', formula: '=B1#>0' }),
        {
          ranges: [at(0, 3)],
          is: 'scale',
          min: { c: '#ffffff', at: 'min' },
          mid: { c: '#808080', at: 'pct', v: 50 },
          max: { c: '#000000', at: 'max' },
        },
      ],
      "Bob's",
      () => 'ConditionalStyle_1',
    );
    const values = xml.map((x) => /calcext:value="([^"]*)"/.exec(x)?.[1]);
    expect(values).toEqual([
      '&gt;10',
      '!=&quot;x&quot;&quot;y&quot;',
      'between(1,3)',
      'contains-text(&quot;a&quot;)',
      'formula-is(LEN(TRIM([.A1]))=0)',
      'formula-is(LEN(TRIM([.A1]))&gt;0)',
      "formula-is([$'Other sheet'.$B1]&lt;2)",
      'formula-is(B1#&gt;0)',
      '0',
    ]);
    expect(xml[0]).toBe(
      `<calcext:conditional-format calcext:target-range-address="'Bob''s'.A2:'Bob''s'.A10 'Bob''s'.C1"><calcext:condition calcext:apply-style-name="ConditionalStyle_1" calcext:value="&gt;10" calcext:base-cell-address="'Bob''s'.A2"/></calcext:conditional-format>`,
    );
    expect(xml[8]).toContain(
      '<calcext:color-scale><calcext:color-scale-entry calcext:value="0" calcext:type="minimum" calcext:color="#ffffff"/><calcext:color-scale-entry calcext:value="50" calcext:type="percent" calcext:color="#808080"/>',
    );
    expect(odsFormatRulesXml(undefined, 'S', () => 'x')).toEqual([]);
  });
});

describe('through a file', () => {
  const rules: FileFormatRule[] = [
    { ranges: [at(0, 0, 2, 0)], is: 'when', op: 'gt', a: 1, style: RED },
    { ranges: [at(0, 0, 2, 0)], is: 'when', op: 'contains', a: 'x', style: { b: true } },
    {
      ranges: [at(0, 1, 2, 1)],
      is: 'scale',
      min: { c: '#ffffff', at: 'min' },
      max: { c: '#57bb8a', at: 'max' },
    },
  ];
  const book = (more: Partial<WorkbookFile> = {}): WorkbookFile => ({
    sheets: [
      {
        name: 'Data',
        rows: 3,
        cols: 3,
        cells: [{ r: 0, c: 0, value: { k: 'n', v: 5 } }],
        formatRules: rules,
      },
    ],
    ...more,
  });
  it('reads back what it writes, as a package and a flat file', async () => {
    for (const data of [
      writeOds(book(), 'T').data,
      new TextEncoder().encode(writeFlatOds(book(), 'T').data),
    ]) {
      const read = await readOds(data);
      if (!read.ok) throw new Error(read.rejection);
      expect(read.file.sheets[0]!.formatRules).toEqual(rules);
      expect(read.losses).toEqual([]);
    }
    const none = writeFlatOds(
      { sheets: [{ name: 'Data', rows: 1, cols: 1, cells: [] }] },
      'T',
    ).data;
    expect(none).not.toContain('calcext');
  });
  it('keeps a condition it cannot hold with its style, first, its style\u2019s name kept clear of its own', async () => {
    const flat = (inner: string) =>
      new TextEncoder().encode(
        `<?xml version="1.0"?><office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.spreadsheet">` +
          '<office:styles><style:style style:name="ConditionalStyle_5f_1" style:display-name="ConditionalStyle_1" style:family="table-cell"><style:text-properties fo:font-weight="bold"/></style:style></office:styles>' +
          `<office:body><office:spreadsheet><table:table table:name="Data"><table:table-row><table:table-cell office:value-type="float" office:value="5"/></table:table-row>${inner}</table:table></office:spreadsheet></office:body></office:document>`,
      );
    const first = await readOds(
      flat(
        '<calcext:conditional-formats>' +
          format(
            'Data.A1',
            condition('duplicate', 'ConditionalStyle_1', 'Data.A1') +
              condition('&gt;1', 'ConditionalStyle_1', 'Data.A1'),
          ) +
          format('Data.B1', condition('&gt;2', 'ConditionalStyle_1', 'Data.B1')) +
          '</calcext:conditional-formats>',
      ),
    );
    if (!first.ok) throw new Error(first.rejection);
    expect(first.file.sheets[0]!.formatRules!.map((x) => x.a)).toEqual([1, 2]);
    const kept = first.file.kept!.items.map((x) => x.xml);
    expect(kept).toContain(
      `<calcext:conditional-formats>${format('Data.A1', condition('duplicate', 'ConditionalStyle_1', 'Data.A1'))}</calcext:conditional-formats>`,
    );
    expect(kept.some((x) => x.startsWith('<style:style style:name="ConditionalStyle_5f_1"'))).toBe(
      true,
    );
    const written = writeFlatOds(
      { ...first.file, sheets: [{ ...first.file.sheets[0]!, formatRules: [rules[0]!] }] },
      'T',
    ).data;
    expect(written).toContain('style:display-name="ConditionalStyle_2"');
    expect(written).toMatch(
      /<calcext:conditional-formats><calcext:conditional-format calcext:target-range-address="Data.A1"><calcext:condition calcext:apply-style-name="ConditionalStyle_1" calcext:value="duplicate"[^]*?<\/calcext:conditional-format><calcext:conditional-format calcext:target-range-address="Data.A1:Data.A3"><calcext:condition calcext:apply-style-name="ConditionalStyle_2"/,
    );
    // A kept, empty list of rules takes LiveDoc's own.
    const empty = await readOds(flat('<calcext:conditional-formats/>'));
    if (!empty.ok) throw new Error(empty.rejection);
    const again = writeFlatOds(
      { ...empty.file, sheets: [{ ...empty.file.sheets[0]!, formatRules: [rules[0]!] }] },
      'T',
    );
    expect(again.data).toMatch(
      /<calcext:conditional-formats><calcext:conditional-format [^]*<\/calcext:conditional-formats>/,
    );
    // A package keeps the styles in styles.xml.
    const pkg = await readOds(writeOds(first.file, 'T').data);
    if (!pkg.ok) throw new Error(pkg.rejection);
    expect(pkg.file.kept!.items.filter((x) => x.place === 'common-styles')).toHaveLength(1);
  });
  it('keeps a style named by its name alone, and a rule in a file with no common styles', async () => {
    const flat = (styles: string) =>
      new TextEncoder().encode(
        `<?xml version="1.0"?><office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.spreadsheet">${styles}` +
          `<office:body><office:spreadsheet><table:table table:name="Data"><table:table-row><table:table-cell/></table:table-row><calcext:conditional-formats>${format('Data.A1', condition('duplicate', 'Plain'))}</calcext:conditional-formats></table:table></office:spreadsheet></office:body></office:document>`,
      );
    const named = await readOds(flat(STYLES));
    if (!named.ok) throw new Error(named.rejection);
    const written = writeFlatOds(
      { ...named.file, sheets: [{ ...named.file.sheets[0]!, formatRules: [rules[0]!] }] },
      'T',
    );
    expect(written.data).toContain('<style:style style:name="Plain"');
    expect(written.data).toContain('style:display-name="ConditionalStyle_1"');
    const bare = await readOds(flat(''));
    if (!bare.ok) throw new Error(bare.rejection);
    expect(bare.file.kept!.items.filter((x) => x.place === 'common-styles')).toEqual([]);
  });
  it('names a sheet whose rule style says more than a style holds', async () => {
    const read = await readOds(
      new TextEncoder().encode(
        `<?xml version="1.0"?><office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.spreadsheet">${STYLES}` +
          `<office:body><office:spreadsheet><table:table table:name="Data"><table:table-row><table:table-cell/></table:table-row><calcext:conditional-formats>${format('Data.A1', condition('&gt;1', 'Wide'))}</calcext:conditional-formats></table:table></office:spreadsheet></office:body></office:document>`,
      ),
    );
    if (!read.ok) throw new Error(read.rejection);
    expect(read.losses).toContainEqual({ k: 'styles_unread', sheet: 'Data' });
  });
});

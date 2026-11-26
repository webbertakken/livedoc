// Validation rules in ODF (docs/specs/029-sheets/standard-mapping.md "Validation in the file", D293 to D296): each
// criterion written as its closest `table:content-validation` with LiveDoc's exact rule beside it, read back exactly;
// Google's and LibreOffice's conditions read as the closest rules; a changed standard rule read over LiveDoc's; cells'
// runs made into rectangles; the rest left unread.
import { ODF_NS, parseXml } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import type { FileValidationRule } from './file-validation';
import {
  OdsValidationCells,
  odsValidationsOut,
  readOdsValidations,
  ruledRuns,
  rowRules,
  withValidations,
} from './ods-validation';
import type { WorkbookFile } from './workbook-file';

const at = (r1: number, c1: number, r2 = r1, c2 = c1) => [{ r1, c1, r2, c2 }];

const EVERY: FileValidationRule[] = [
  {
    ranges: at(1, 0, 5, 0),
    is: 'list',
    opts: [{ v: 'To Do', c: '#ff0000' }, { v: 'Say "hi"; ok' }],
    show: 'arrow',
    multi: true,
    help: 'Pick a status\nor leave it',
  },
  { ranges: at(1, 1, 5, 1), is: 'range', src: "'My Lists'!A1:A3", show: 'plain' },
  { ranges: at(1, 2, 5, 2), is: 'range', src: 'D1:D3' },
  { ranges: at(1, 3), is: 'check' },
  { ranges: at(2, 3), is: 'check', on: 'Yes', off: 'No' },
  { ranges: at(1, 4), is: 'num', op: 'between', a: 1, b: 10 },
  { ranges: at(2, 4), is: 'num', op: 'neq', a: -2.5, warn: true },
  { ranges: at(3, 4), is: 'num', op: 'notBetween', a: 1, b: 2 },
  { ranges: at(1, 5), is: 'date', op: 'valid' },
  { ranges: at(2, 5), is: 'date', op: 'onOrAfter', a: 46296 },
  { ranges: at(1, 6), is: 'text', op: 'contains', a: 'ref' },
  { ranges: at(2, 6), is: 'text', op: 'exactly', a: 'Yes' },
  { ranges: at(3, 6), is: 'text', op: 'email' },
  { ranges: at(1, 7, 4, 7), is: 'formula', fx: '=I2>H2', warn: true, help: 'Bigger' },
];

const SHEET = 'livedoc probe';

function spreadsheet(inner: string) {
  const parsed = parseXml(
    `<office:spreadsheet xmlns:office="${ODF_NS.office}" xmlns:table="${ODF_NS.table}" xmlns:text="${ODF_NS.text}">${inner}</office:spreadsheet>`,
  );
  if (!parsed.ok) throw new Error('parse');
  return parsed.root;
}

// The rules as read from their elements, each over its cells as written.
function roundTrip(rules: FileValidationRule[]) {
  const file: WorkbookFile = {
    sheets: [{ name: SHEET, rows: 10, cols: 10, cells: [], validations: rules }],
  };
  const out = odsValidationsOut(file, (name) => name === 'LiveDocValidation2');
  const read = readOdsValidations(spreadsheet(withValidations([], out.elements).join('')));
  const cells = new OdsValidationCells(read.byName);
  for (const { name, range } of out.cells[0]!) cells.add(name, range);
  return { out, read, ...cells.fileRules() };
}

describe('every criterion in ODF', () => {
  it('reads back exactly through LiveDoc’s rule, named past a kept name', () => {
    const { out, rules, changed, read } = roundTrip(EVERY);
    expect(rules).toEqual(EVERY);
    expect(changed).toEqual([]);
    expect(read.read.size).toBe(EVERY.length);
    expect(out.cells[0]!.map((x) => x.name).slice(0, 3)).toEqual([
      'LiveDocValidation1',
      'LiveDocValidation3',
      'LiveDocValidation4',
    ]);
  });

  it('writes the closest standard rule other apps check', () => {
    const { out } = roundTrip(EVERY);
    const condition = (i: number) => /table:condition="([^"]*)"/.exec(out.elements[i]!)?.[1];
    expect(condition(0)).toBe(
      'of:cell-content-is-in-list(&quot;To Do&quot;;&quot;Say &quot;&quot;hi&quot;&quot;; ok&quot;)',
    );
    expect(out.elements[0]).toContain(
      '<table:help-message table:display="true"><text:p>Pick a status</text:p><text:p>or leave it</text:p></table:help-message>',
    );
    expect(out.elements[0]).toContain(`table:base-cell-address="'livedoc probe'.A2"`);
    expect(condition(1)).toBe("of:cell-content-is-in-list([$'My Lists'.$A$1:.$A$3])");
    expect(condition(2)).toBe('of:cell-content-is-in-list([.$D$1:.$D$3])');
    expect(condition(3)).toBe('of:cell-content-is-in-list(&quot;TRUE&quot;;&quot;FALSE&quot;)');
    expect(condition(5)).toBe(
      'of:cell-content-is-decimal-number() and cell-content-is-between(1,10)',
    );
    expect(condition(6)).toBe('of:cell-content-is-decimal-number() and cell-content()!=-2.5');
    expect(out.elements[6]).toContain('table:message-type="warning"');
    expect(condition(7)).toBe(
      'of:cell-content-is-decimal-number() and cell-content-is-not-between(1,2)',
    );
    expect(condition(9)).toBe('of:cell-content-is-date() and cell-content()&gt;=46296');
    expect(condition(11)).toBe('of:is-true-formula([.G3]=&quot;Yes&quot;)');
    expect(condition(13)).toBe('of:is-true-formula([.I2]&gt;[.H2])');
    expect(out.elements[13]).toContain('table:message-type="warning"');
    expect(out.elements[3]).toContain('table:display-list="unsorted"');
    expect(out.elements[5]).not.toContain('display-list');
  });

  it('writes a rule allowing anything without a condition, read back only through LiveDoc’s', () => {
    const rules: FileValidationRule[] = [{ ranges: at(0, 0), is: 'range' }];
    const { out, rules: read } = roundTrip(rules);
    expect(out.elements[0]).not.toContain('table:condition');
    expect(read).toEqual(rules);
  });
});

describe('another app’s rules in ODF', () => {
  const rule = (name: string, condition: string, more = '', base = `'S'.A2`) =>
    `<table:content-validation table:name="${name}" table:condition="${condition}" table:base-cell-address="${base}"${more}/>`;

  it('reads Google’s and LibreOffice’s conditions as the closest rules, a formula moved from its base cell', () => {
    const read = readOdsValidations(
      spreadsheet(
        `<table:content-validations>${[
          rule('a', 'of:cell-content-is-in-list(&quot;To Do&quot;;&quot;Done&quot;;3)'),
          rule('b', 'of:cell-content-is-decimal-number() and cell-content()&gt;5'),
          rule('c', 'of:cell-content-is-date() and cell-content-is-between(46296;46387)'),
          rule('d', 'of: and cell-content-is-between([.B2]&gt;[.A2],0)'),
          rule('e', 'of:is-true-formula([.B2]&gt;0)', '', `'S'.B2`),
          rule('f', 'of:cell-content-is-decimal-number() and cell-content()&lt;&gt;5'),
        ].join('')}</table:content-validations>`,
      ),
    );
    const cells = new OdsValidationCells(read.byName);
    for (const [name, c] of [
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3],
      ['e', 4],
      ['f', 5],
    ] as const)
      cells.add(name, { r1: 1, c1: c, r2: 3, c2: c });
    expect(cells.fileRules().rules).toEqual([
      {
        is: 'list',
        opts: [{ v: 'To Do' }, { v: 'Done' }, { v: '3' }],
        warn: true,
        ranges: at(1, 0, 3, 0),
      },
      { is: 'num', op: 'gt', a: 5, warn: true, ranges: at(1, 1, 3, 1) },
      { is: 'date', op: 'between', a: 46296, b: 46387, warn: true, ranges: at(1, 2, 3, 2) },
      { is: 'formula', fx: '=E2>D2', warn: true, ranges: at(1, 3, 3, 3) },
      { is: 'formula', fx: '=E2>0', warn: true, ranges: at(1, 4, 3, 4) },
      { is: 'num', op: 'neq', a: 5, warn: true, ranges: at(1, 5, 3, 5) },
    ]);
  });

  it('reads Reject only from a shown stop, and Help Text only when shown', () => {
    const more = (error: string, help: string) =>
      `<table:content-validation table:name="x" table:condition="of:cell-content-is-in-list(&quot;A&quot;)" table:base-cell-address=".A1">${error}${help}</table:content-validation>`;
    const read = (error: string, help = '') =>
      readOdsValidations(
        spreadsheet(`<table:content-validations>${more(error, help)}</table:content-validations>`),
      ).byName.get('x')!.settings;
    expect(read('<table:error-message table:display="true"/>')).toEqual({
      is: 'list',
      opts: [{ v: 'A' }],
    });
    expect(
      read('<table:error-message table:message-type="stop" table:display="false"/>').warn,
    ).toBe(true);
    expect(
      read('<table:error-message table:message-type="information" table:display="true"/>').warn,
    ).toBe(true);
    expect(
      read(
        '',
        '<table:help-message table:display="true"><text:p>Hi</text:p><x/></table:help-message>',
      ).help,
    ).toBe('Hi');
    expect(
      read('', '<table:help-message><text:p>Hidden</text:p></table:help-message>').help,
    ).toBeUndefined();
  });

  it('reads a standard rule changed since LiveDoc wrote it over LiveDoc’s rule, named (D294)', () => {
    const { out } = roundTrip([{ ranges: at(1, 0), is: 'list', opts: [{ v: 'A', c: '#00ff00' }] }]);
    const changed = out.elements[0]!.replace('&quot;A&quot;)', '&quot;A&quot;;&quot;B&quot;)');
    const read = readOdsValidations(
      spreadsheet(`<table:content-validations>${changed}</table:content-validations>`),
    );
    const cells = new OdsValidationCells(read.byName);
    cells.add('LiveDocValidation1', { r1: 1, c1: 0, r2: 1, c2: 0 });
    expect(cells.fileRules()).toEqual({
      rules: [{ is: 'list', opts: [{ v: 'A' }, { v: 'B' }], ranges: at(1, 0) }],
      changed: [{ r: 1, c: 0 }],
    });
  });

  it('leaves what the model does not hold unread', () => {
    const read = readOdsValidations(
      spreadsheet(
        `<table:content-validations>${[
          rule('w', 'of:cell-content-is-whole-number() and cell-content()&gt;5'),
          rule('l', 'of:cell-content-text-length()&lt;5'),
          rule('n', 'of:cell-content-is-in-list(MyNames)'),
          rule('e', 'of:cell-content-is-in-list(&quot; &quot;)'),
          rule('r', 'of:cell-content-is-in-list([.A1:.A2];[.B1])'),
          rule('x', 'of:cell-content-is-decimal-number() and cell-content()&gt;[.B1]'),
          rule('y', 'of:cell-content-is-decimal-number() and cell-content-is-between(1;[.B1])'),
          rule('z', 'of:is-true-formula(SUM()'),
          rule('o', 'oooc:cell-content-is-in-list(&quot;A&quot;)'),
          rule('m', 'of:cell-content-is-in-list([.A1:.A2 .B1])'),
          rule('nobase', 'of:cell-content-is-in-list(&quot;A&quot;)', '', 'nowhere'),
          '<table:content-validation table:base-cell-address=".A1"/>',
          rule('any', ''),
          '<other/>',
        ].join('')}</table:content-validations>`,
      ),
    );
    expect([...read.byName.keys()]).toEqual([]);
    expect(readOdsValidations(spreadsheet('')).byName.size).toBe(0);
  });
});

describe('cells naming a rule', () => {
  it('joins runs beside each other and runs over the same columns below, and skips names not read', () => {
    const read = readOdsValidations(
      spreadsheet(
        `<table:content-validations><table:content-validation table:name="a" table:condition="of:cell-content-is-in-list(&quot;A&quot;)" table:base-cell-address=".A1"/></table:content-validations>`,
      ),
    );
    const cells = new OdsValidationCells(read.byName);
    cells.add('a', { r1: 0, c1: 0, r2: 0, c2: 0 });
    cells.add('a', { r1: 0, c1: 1, r2: 0, c2: 2 });
    cells.add('a', { r1: 1, c1: 0, r2: 4, c2: 2 });
    cells.add('a', { r1: 6, c1: 0, r2: 6, c2: 2 });
    cells.add('b', { r1: 0, c1: 5, r2: 0, c2: 5 });
    cells.add(undefined, { r1: 0, c1: 6, r2: 0, c2: 6 });
    expect(cells.has('b')).toBe(false);
    expect(cells.fileRules().rules[0]!.ranges).toEqual([
      { r1: 0, c1: 0, r2: 4, c2: 2 },
      { r1: 6, c1: 0, r2: 6, c2: 2 },
    ]);
  });

  it('splits a row’s columns where the rules over them change', () => {
    const rules = rowRules(
      [
        { name: 'b', range: { r1: 0, c1: 4, r2: 3, c2: 5 } },
        { name: 'a', range: { r1: 1, c1: 1, r2: 2, c2: 2 } },
      ],
      1,
    );
    expect(rules.map((x) => x.name)).toEqual(['a', 'b']);
    expect(ruledRuns(rules, 0, 8)).toEqual([
      { n: 1 },
      { n: 2, name: 'a' },
      { n: 1 },
      { n: 2, name: 'b' },
      { n: 2 },
    ]);
    expect(ruledRuns(rules, 2, 5)).toEqual([{ n: 1, name: 'a' }, { n: 1 }, { n: 1, name: 'b' }]);
    expect(ruledRuns([], 0, 3)).toEqual([{ n: 3 }]);
  });

  it('puts LiveDoc’s rules after the kept ones in the kept holder', () => {
    expect(withValidations(['<x/>'], [])).toEqual(['<x/>']);
    expect(withValidations(['<table:label-ranges/>'], ['<r/>'])).toEqual([
      '<table:content-validations><r/></table:content-validations>',
      '<table:label-ranges/>',
    ]);
    expect(
      withValidations(['<table:content-validations><k/></table:content-validations>'], ['<r/>']),
    ).toEqual(['<table:content-validations><k/><r/></table:content-validations>']);
    expect(withValidations(['<t:content-validations a="1"/>'], ['<r/>'])).toEqual([
      '<t:content-validations a="1"><r/></t:content-validations>',
    ]);
  });
});

// Validation rules in XLSX (docs/specs/029-sheets/standard-mapping.md "Validation in the file", D289 to D292): each
// criterion written as its closest `dataValidation` with LiveDoc's exact rule in an `ext`, read back exactly; Google's
// own export read as the closest rules; a standard rule another app changed read over LiveDoc's; the rest left unread.
import { parseXml } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import type { FileValidationRule } from './file-validation';
import { readXlsxValidations, xlsxValidationsXml } from './xlsx-validation';
import { SPREADSHEETML_NS } from './xlsx-parts';

const at = (r1: number, c1: number, r2 = r1, c2 = c1) => [{ r1, c1, r2, c2 }];

const EVERY: FileValidationRule[] = [
  {
    ranges: at(1, 0, 5, 0),
    is: 'list',
    opts: [{ v: 'To Do', c: '#ff0000' }, { v: 'Say "hi"' }],
    show: 'arrow',
    multi: true,
    help: 'Pick a status',
  },
  { ranges: at(1, 1, 5, 1), is: 'range', src: "'My Lists'!A1:A3", show: 'plain' },
  { ranges: at(1, 2, 5, 2), is: 'range', src: 'D1:D3' },
  { ranges: at(1, 3), is: 'check' },
  { ranges: at(2, 3), is: 'check', on: 'Yes', off: 'No' },
  { ranges: at(3, 3), is: 'check', on: 1 },
  { ranges: at(1, 4), is: 'num', op: 'between', a: 1, b: 10 },
  { ranges: at(2, 4), is: 'num', op: 'neq', a: -2.5, warn: true },
  { ranges: at(1, 5), is: 'date', op: 'valid' },
  { ranges: at(2, 5), is: 'date', op: 'on', a: 46296 },
  { ranges: at(3, 5), is: 'date', op: 'notBetween', a: 46296, b: 46387 },
  { ranges: at(1, 6), is: 'text', op: 'contains', a: 'ref' },
  { ranges: at(2, 6), is: 'text', op: 'notContains', a: 'x' },
  { ranges: at(3, 6), is: 'text', op: 'exactly', a: 'Yes' },
  { ranges: at(4, 6), is: 'text', op: 'email' },
  { ranges: at(5, 6), is: 'text', op: 'url' },
  { ranges: at(1, 7, 4, 7), is: 'formula', fx: '=I2>H2', warn: true, help: 'Bigger' },
  { ranges: at(5, 7), is: 'formula', fx: '=QUERY(A1:B2,"select A")' },
];

function worksheet(inner: string) {
  const parsed = parseXml(`<worksheet xmlns="${SPREADSHEETML_NS}">${inner}</worksheet>`);
  if (!parsed.ok) throw new Error('parse');
  return parsed.root;
}

function written(rules: FileValidationRule[], renamed = new Map<string, string>()) {
  const out = xlsxValidationsXml(rules, renamed);
  return {
    ...out,
    xml: `<dataValidations count="${out.validations.length}">${out.validations.join('')}</dataValidations><extLst>${out.ext ?? ''}</extLst>`,
  };
}

describe('every criterion in XLSX', () => {
  it('reads back exactly through LiveDoc’s rule', () => {
    const read = readXlsxValidations(worksheet(written(EVERY).xml), SPREADSHEETML_NS);
    expect(read.rules).toEqual(EVERY);
    expect(read.changed).toEqual([]);
    // Every dataValidation and the ext are read, so nothing of them is kept.
    expect(read.read.size).toBe(EVERY.length + 1);
  });

  it('writes the closest standard rule other apps check', () => {
    const { validations } = written(EVERY);
    expect(validations[0]).toBe(
      '<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" prompt="Pick a status" sqref="A2:A6"><formula1>"To Do,Say ""hi"""</formula1></dataValidation>',
    );
    expect(validations[1]).toContain("<formula1>'My Lists'!$A$1:$A$3</formula1>");
    expect(validations[2]).toContain('<formula1>$D$1:$D$3</formula1>');
    expect(validations[3]).toContain('type="list"');
    expect(validations[3]).toContain('<formula1>"TRUE,FALSE"</formula1>');
    expect(validations[4]).toContain('<formula1>"Yes,No"</formula1>');
    expect(validations[5]).toContain('<formula1>"1"</formula1>');
    expect(validations[6]).toContain('type="decimal" operator="between"');
    expect(validations[6]).toContain('<formula1>1</formula1><formula2>10</formula2>');
    expect(validations[7]).toContain('type="decimal" errorStyle="warning" operator="notEqual"');
    expect(validations[8]).toContain(
      '<formula1>OR(NOT(ISERROR(DATEVALUE(F2))),AND(ISNUMBER(F2),LEFT(CELL("format",F2))="D"))</formula1>',
    );
    expect(validations[9]).toContain('type="date" operator="equal"');
    expect(validations[13]).toContain('<formula1>G4="Yes"</formula1>');
    expect(validations[14]).toContain('__xludf.DUMMYFUNCTION');
    expect(validations[14]).toContain(',TRUE)</formula1>');
    expect(validations[16]).toContain('<formula1>I2&gt;H2</formula1>');
  });

  it('writes a list XLSX cannot say as a rule allowing anything, still exact for LiveDoc (D291)', () => {
    const rules: FileValidationRule[] = [
      { ranges: at(0, 0), is: 'list', opts: [{ v: 'a,b' }] },
      {
        ranges: at(1, 0),
        is: 'list',
        opts: Array.from({ length: 60 }, (_, i) => ({ v: `opt${i}` })),
      },
    ];
    const out = written(rules);
    expect(out.validations[0]).toBe(
      '<dataValidation allowBlank="1" showErrorMessage="1" sqref="A1"></dataValidation>',
    );
    expect(out.validations[1]).not.toContain('type=');
    expect(readXlsxValidations(worksheet(out.xml), SPREADSHEETML_NS).rules).toEqual(rules);
  });

  it('names a source sheet as Excel’s file renames it, and cuts ranges past its last column', () => {
    const rules: FileValidationRule[] = [
      { ranges: at(0, 0), is: 'range', src: "'A very long sheet name past 31 c'!A1:A2" },
      { ranges: [{ r1: 0, c1: 16_383, r2: 0, c2: 16_390 }], is: 'formula', fx: '=XFD1>0' },
      { ranges: at(0, 16_384), is: 'check' },
    ];
    const renamed = new Map([
      ['A very long sheet name past 31 c', 'A very long sheet name past 31'],
    ]);
    const out = written(rules, renamed);
    expect(out.validations).toHaveLength(2);
    expect(out.validations[0]).toContain("'A very long sheet name past 31'!$A$1:$A$2");
    expect(out.validations[1]).toContain('sqref="XFD1"');
    expect(readXlsxValidations(worksheet(out.xml), SPREADSHEETML_NS).rules).toEqual([
      { ranges: at(0, 0), is: 'range', src: "'A very long sheet name past 31'!A1:A2" },
      { ranges: at(0, 16_383), is: 'formula', fx: '=XFD1>0' },
    ]);
  });
});

describe('another app’s rules in XLSX', () => {
  // Google Sheets' own export (plans/assets/0020/research/google-validation-export.md).
  const GOOGLE = `<dataValidations><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" prompt="Pick a status" sqref="A2:A6"><formula1>&quot;To Do,Doing,Done&quot;</formula1></dataValidation><dataValidation type="decimal" operator="greaterThan" allowBlank="1" sqref="H2:H6"><formula1>5.0</formula1></dataValidation><dataValidation type="custom" allowBlank="1" sqref="N2:N6"><formula1>NOT(ISERROR(SEARCH((&quot;ref&quot;),(N2))))</formula1></dataValidation><dataValidation type="date" allowBlank="1" sqref="M2:M6"><formula1>46296.0</formula1><formula2>46387.0</formula2></dataValidation><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="B2:B6"><formula1>'My Lists'!$A$1:$A$3</formula1></dataValidation><dataValidation type="decimal" allowBlank="1" showErrorMessage="1" errorStyle="information" sqref="F2:F6 G9"><formula1>1.0</formula1><formula2>10.0</formula2></dataValidation></dataValidations>`;

  it('reads Google’s export as the closest rules, a warning where no error stops a value', () => {
    const read = readXlsxValidations(worksheet(GOOGLE), SPREADSHEETML_NS);
    expect(read.rules).toEqual([
      {
        ranges: at(1, 0, 5, 0),
        is: 'list',
        opts: [{ v: 'To Do' }, { v: 'Doing' }, { v: 'Done' }],
        help: 'Pick a status',
      },
      { ranges: at(1, 7, 5, 7), is: 'num', op: 'gt', a: 5, warn: true },
      {
        ranges: at(1, 13, 5, 13),
        is: 'formula',
        fx: '=NOT(ISERROR(SEARCH(("ref"),(N2))))',
        warn: true,
      },
      { ranges: at(1, 12, 5, 12), is: 'date', op: 'between', a: 46296, b: 46387, warn: true },
      { ranges: at(1, 1, 5, 1), is: 'range', src: "'My Lists'!A1:A3" },
      {
        ranges: [
          { r1: 1, c1: 5, r2: 5, c2: 5 },
          { r1: 8, c1: 6, r2: 8, c2: 6 },
        ],
        is: 'num',
        op: 'between',
        a: 1,
        b: 10,
        warn: true,
      },
    ]);
  });

  it('reads a standard rule changed since LiveDoc wrote it over LiveDoc’s rule, naming it (D290)', () => {
    const rules: FileValidationRule[] = [
      { ranges: at(1, 0, 3, 0), is: 'list', opts: [{ v: 'A', c: '#00ff00' }, { v: 'B' }] },
      { ranges: at(1, 1), is: 'check' },
    ];
    const changed = written(rules).xml.replace('"A,B"', '"A,B,C"');
    const read = readXlsxValidations(worksheet(changed), SPREADSHEETML_NS);
    expect(read.rules).toEqual([
      { ranges: at(1, 0, 3, 0), is: 'list', opts: [{ v: 'A' }, { v: 'B' }, { v: 'C' }] },
      { ranges: at(1, 1), is: 'check' },
    ]);
    expect(read.changed).toEqual([{ r: 1, c: 0 }]);
  });

  it('leaves what the model does not hold unread, and reads a rule allowing anything only with LiveDoc’s', () => {
    const xml = `<dataValidations>
      <dataValidation type="whole" sqref="A1"><formula1>1</formula1></dataValidation>
      <dataValidation type="textLength" operator="lessThan" sqref="A2"><formula1>5</formula1></dataValidation>
      <dataValidation type="list" sqref="A3"><formula1>MyNames</formula1></dataValidation>
      <dataValidation type="list" sqref="A4"><formula1>""</formula1></dataValidation>
      <dataValidation type="decimal" operator="between" sqref="A5"><formula1>B1</formula1><formula2>2</formula2></dataValidation>
      <dataValidation type="decimal" operator="sideways" sqref="A6"><formula1>1</formula1></dataValidation>
      <dataValidation type="custom" sqref="A7"><formula1>SUM(</formula1></dataValidation>
      <dataValidation type="custom" sqref="A8"><formula1> </formula1></dataValidation>
      <dataValidation sqref="A9" showInputMessage="1" prompt="Just a note"/>
      <dataValidation type="decimal" sqref="nowhere"><formula1>1</formula1></dataValidation>
      <dataValidation type="date" operator="notEqual" sqref="A10"><formula1>1</formula1></dataValidation>
      <other/>
    </dataValidations>`;
    const read = readXlsxValidations(worksheet(xml), SPREADSHEETML_NS);
    expect(read.rules.map((x) => x.ranges[0])).toEqual([]);
    expect(read.read.size).toBe(0);
    expect(readXlsxValidations(worksheet(''), SPREADSHEETML_NS).rules).toEqual([]);
  });

  it('skips LiveDoc entries it cannot use and an ext of another app', () => {
    const xml = `<extLst><ext uri="{other}"><x/></ext><ext uri="urn:livedoc:xmlns:spreadsheet:1.0" xmlns:livedoc="urn:livedoc:xmlns:spreadsheet:1.0"><livedoc:dataValidations><livedoc:dataValidation sqref="A1"/><livedoc:other sqref="A1" rule="{}"/></livedoc:dataValidations></ext></extLst>`;
    const read = readXlsxValidations(worksheet(xml), SPREADSHEETML_NS);
    expect(read.rules).toEqual([]);
    expect(read.read.size).toBe(1);
  });
});

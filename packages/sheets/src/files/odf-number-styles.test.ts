// docs/specs/029-sheets/standard-mapping.md "Number formats in the file" (D93): a code as ODF data styles, sections as
// maps, colours as text properties, and back; a file LiveDoc wrote reads back to its own code.
import {
  parseXml,
  ODF_NS,
  childElements,
  attributeOf,
  type XmlElement,
} from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { dataStyleXml } from './odf-number-styles';
import { readDataStyle } from './odf-number-styles-read';

const NS = `xmlns:number="${ODF_NS.number}" xmlns:style="${ODF_NS.style}" xmlns:fo="${ODF_NS.fo}"`;

// The styles a code writes, parsed, by name; the main one last.
function stylesOf(xml: readonly string[]): Map<string, XmlElement> {
  const parsed = parseXml(`<root ${NS}>${xml.join('')}</root>`);
  if (!parsed.ok) throw new Error(parsed.rejection);
  return new Map(childElements(parsed.root).map((e) => [attributeOf(e, ODF_NS.style, 'name')!, e]));
}

// What a code reads back as from its own data styles, without its title (as another maker's file would have it).
function roundTrip(code: string, keepTitle = false): ReturnType<typeof readDataStyle> {
  const xml = dataStyleXml('N1', code)!;
  const styles = stylesOf(keepTitle ? xml : xml.map((s) => s.replace(/ number:title="[^"]*"/, '')));
  return readDataStyle(styles.get('N1')!, styles);
}

describe('dataStyleXml', () => {
  it('writes a number with its digits, grouping and the code as the title', () => {
    expect(dataStyleXml('N1', '#,##0.00')).toEqual([
      '<number:number-style style:name="N1" number:title="#,##0.00"><number:number number:decimal-places="2" number:min-decimal-places="2" number:min-integer-digits="1" number:grouping="true"/></number:number-style>',
    ]);
  });

  it('writes sections as maps, as LibreOffice does, with their colours', () => {
    const xml = dataStyleXml('N2', '0.0;[Red]-0.0;"zero"')!;
    expect(xml).toHaveLength(3);
    expect(xml[1]).toContain(
      '<style:text-properties fo:color="#ff0000"/><number:text>-</number:text>',
    );
    expect(xml[2]).toContain(
      '<style:map style:condition="value()&gt;0" style:apply-style-name="N2P0"/><style:map style:condition="value()&lt;0" style:apply-style-name="N2P1"/>',
    );
  });

  it('writes percentages, scientific numbers, dates, elapsed times and text', () => {
    expect(dataStyleXml('N', '0%')![0]).toContain('<number:percentage-style');
    expect(dataStyleXml('N', '0.00E+00')![0]).toContain(
      '<number:scientific-number number:decimal-places="2" number:min-decimal-places="2" number:min-integer-digits="1" number:min-exponent-digits="2"/>',
    );
    expect(dataStyleXml('N', 'dd/mm/yyyy hh:mm')![0]).toContain(
      '<number:day number:style="long"/><number:text>/</number:text><number:month number:style="long"/><number:text>/</number:text><number:year number:style="long"/><number:text> </number:text><number:hours number:style="long"/><number:text>:</number:text><number:minutes number:style="long"/>',
    );
    expect(dataStyleXml('N', '[h]:mm:ss.00')![0]).toContain('number:truncate-on-overflow="false"');
    expect(dataStyleXml('N', '[h]:mm:ss.00')![0]).toContain(
      '<number:seconds number:style="long" number:decimal-places="2"/>',
    );
    expect(dataStyleXml('N', '"Total: "@')![0]).toContain('<number:text-style');
  });

  it('says nothing for what ODF cannot hold here', () => {
    for (const code of [
      '# ?/?',
      '0,',
      '[Color12]0',
      '[h]:mm dd',
      'mmmmm',
      '0"x"0',
      '@*-',
      '@0',
      'ss.0.0',
      '[>1]0;0;0',
    ])
      expect(dataStyleXml('N', code)).toBeNull();
  });
});

describe('the codes ODF holds, each part both ways', () => {
  it.each([
    ['[<>0]0;0', '[<>0]0;0'],
    ['[>=10][Blue]0', '[Blue]0'],
    ['[$£-809]#,##0.00', '"£"#,##0.00'],
    ['%0', '%0'],
    ['[hh]:mm', '[hh]:mm'],
    ['d-mmm-yy', 'd-mmm-yy'],
    ['ddd m mmmm', 'ddd m mmmm'],
    ['h:m:s', 'h:m:s'],
    ['mm:ss.00', 'mm:ss.00'],
    ['0\\', '0'],
    ['0*', '0* '],
    ['0"abc', '0"abc"'],
  ])('writes %s and reads it back as %s', (code, back) => {
    expect(roundTrip(code)?.code).toBe(back);
  });

  it('says nothing for a colour it does not know', () => {
    expect(dataStyleXml('N', '[Purple]0')).toBeNull();
  });
});

describe('readDataStyle', () => {
  it('reads back every code the model writes, title or none', () => {
    for (const code of [
      '#,##0.00',
      '0',
      '0.0%',
      '0.00E+00',
      '"£"#,##0.00',
      'dd/mm/yyyy',
      'mm/dd/yyyy hh:mm',
      'hh:mm:ss',
      '[h]:mm:ss',
      '@',
      '#,##0.00;[Red]-#,##0.00',
      '0.0;-0.0;"zero";@',
      'dddd d mmmm yyyy h:mm AM/PM',
    ]) {
      expect(roundTrip(code)).toEqual({ code, approximate: false });
      expect(roundTrip(code, true)).toEqual({ code, approximate: false });
    }
  });

  it('keeps the title where it writes the same structure, and reads structure where it does not', () => {
    const accounting = '_("£"* #,##0.00_);_("£"* \\(#,##0.00\\);_("£"* "-"??_);_(@_)';
    expect(roundTrip(accounting, true)).toEqual({ code: accounting, approximate: false });
    expect(roundTrip(accounting)?.code).toBe('" £"* #,##0.00 ;" £"* (#,##0.00);" £"* -# ; @ ');
    const xml = dataStyleXml('N1', '0.00')!.map((s) =>
      s.replace('number:title="0.00"', 'number:title="0.0"'),
    );
    const styles = stylesOf(xml);
    expect(readDataStyle(styles.get('N1')!, styles)).toEqual({ code: '0.00', approximate: false });
  });

  it('reads explicit conditions, and marks what a code cannot say approximate', () => {
    const styles = stylesOf([
      '<number:number-style style:name="A"><number:number number:decimal-places="0"/></number:number-style>',
      '<number:number-style style:name="B"><style:text-properties fo:color="#123456"/><number:number/><style:map style:condition="value()&lt;=10" style:apply-style-name="A"/><style:map style:condition="weird" style:apply-style-name="A"/></number:number-style>',
      '<number:date-style style:name="C"><number:quarter/><number:year/></number:date-style>',
      '<number:number-style style:name="D"><number:number number:decimal-places="2"><number:embedded-text number:position="1">-</number:embedded-text></number:number></number:number-style>',
      '<number:boolean-style style:name="E"><number:boolean/></number:boolean-style>',
      '<number:time-style style:name="F" number:truncate-on-overflow="false"><number:hours number:style="long"/><number:seconds/><number:am-pm/></number:time-style>',
      '<number:number-style style:name="G"><number:currency-symbol>€</number:currency-symbol><number:fill-character/><number:number number:min-integer-digits="5" number:grouping="true" number:decimal-places="3" number:min-decimal-places="1"/></number:number-style>',
      '<number:text-style style:name="H"><number:text>"q"</number:text><number:text-content/></number:text-style>',
      '<number:number-style style:name="I"><style:text-properties/><style:other/><number:scientific-number number:decimal-places="1"/><style:map/></number:number-style>',
      '<number:number-style style:name="J"/>',
    ]);
    const read = (name: string) => readDataStyle(styles.get(name)!, styles);
    expect(read('B')).toEqual({ code: '[<=10]#;#', approximate: true });
    expect(read('C')).toEqual({ code: 'yy', approximate: true });
    expect(read('D')).toEqual({ code: '#.00', approximate: true });
    expect(read('E')).toEqual({ code: '', approximate: true });
    expect(read('F')).toEqual({ code: '[hh]sAM/PM', approximate: false });
    expect(read('G')).toEqual({ code: '"€"* 00,000.0##', approximate: false });
    expect(read('H')).toEqual({ code: '\\"\\q\\"@', approximate: false });
    expect(read('I')).toEqual({ code: '#.0E+00', approximate: true });
    expect(read('J')).toBeNull();
  });
});

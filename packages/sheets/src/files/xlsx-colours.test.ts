import { describe, expect, it } from 'vitest';
import { parseXml, type XmlElement } from '@livedoc/office-packages';
import { readThemeColours, xlsxColourOf, xlsxColourXml } from './xlsx-colours';

const colour = (xml: string): XmlElement => {
  const parsed = parseXml(xml, 'colour.xml');
  if (!parsed.ok) throw new Error('bad xml');
  return parsed.root;
};

const THEME = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>
<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme></a:themeElements></a:theme>`;

// standard-mapping.md "Cell styles in the file", Colours: rgb, ECMA-376's indexed palette, the theme with its tint.
describe('xlsxColourOf', () => {
  const theme = readThemeColours(THEME);

  it('reads an rgb colour, its alpha ignored, in lower case', () => {
    expect(xlsxColourOf(colour('<color rgb="FFFF0000"/>'), theme)).toBe('#ff0000');
    expect(xlsxColourOf(colour('<color rgb="00a1B2c3"/>'), theme)).toBe('#a1b2c3');
    expect(xlsxColourOf(colour('<color rgb="123"/>'), theme)).toBeNull();
  });

  it('reads an indexed colour from the standard palette; the system ones are none', () => {
    expect(xlsxColourOf(colour('<color indexed="10"/>'), theme)).toBe('#ff0000');
    expect(xlsxColourOf(colour('<color indexed="0"/>'), theme)).toBe('#000000');
    expect(xlsxColourOf(colour('<color indexed="64"/>'), theme)).toBeNull();
    expect(xlsxColourOf(colour('<color indexed="x"/>'), theme)).toBeNull();
  });

  it('reads a theme colour by its slot, light before dark, with its tint', () => {
    expect(xlsxColourOf(colour('<color theme="1"/>'), theme)).toBe('#000000');
    expect(xlsxColourOf(colour('<color theme="0"/>'), theme)).toBe('#ffffff');
    expect(xlsxColourOf(colour('<color theme="4"/>'), theme)).toBe('#4472c4');
    // Excel's "Blue, Accent 1, Lighter 80%" and "Darker 50%".
    expect(xlsxColourOf(colour('<color theme="4" tint="0.79998168889431442"/>'), theme)).toBe(
      '#dae3f3',
    );
    expect(xlsxColourOf(colour('<color theme="4" tint="-0.499984740745262"/>'), theme)).toBe(
      '#203864',
    );
    // Orange, Accent 2 and Green, Accent 6, Lighter 80%, as Office's palette shows them; grey keeps no hue.
    expect(xlsxColourOf(colour('<color theme="5" tint="0.79998168889431442"/>'), theme)).toBe(
      '#fbe5d6',
    );
    expect(xlsxColourOf(colour('<color theme="9" tint="0.79998168889431442"/>'), theme)).toBe(
      '#e2f0d9',
    );
    expect(xlsxColourOf(colour('<color theme="6" tint="0.5"/>'), theme)).toBe('#d2d2d2');
    expect(xlsxColourOf(colour('<color theme="12"/>'), theme)).toBeNull();
    expect(xlsxColourOf(colour('<color theme="4"/>'), [])).toBeNull();
  });

  it('is none for auto or no colour at all', () => {
    expect(xlsxColourOf(colour('<color auto="1"/>'), theme)).toBeNull();
    expect(xlsxColourOf(undefined, theme)).toBeNull();
  });
});

describe('readThemeColours', () => {
  it('reads the twelve slots in SpreadsheetML’s order, none from a part it cannot read', () => {
    expect(readThemeColours(THEME).slice(0, 5)).toEqual([
      '#ffffff',
      '#000000',
      '#e7e6e6',
      '#44546a',
      '#4472c4',
    ]);
    expect(readThemeColours(undefined)).toEqual([]);
    expect(readThemeColours('<a:theme')).toEqual([]);
    expect(readThemeColours('<theme/>')).toEqual([]);
    // A slot missing or not a colour is none.
    const partial = readThemeColours(
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme>' +
        '<a:dk1><a:srgbClr val="zz"/></a:dk1><a:lt1/></a:clrScheme></a:themeElements></a:theme>',
    );
    expect(partial.slice(0, 3)).toEqual(['', '', '']);
  });
});

describe('xlsxColourXml', () => {
  it('writes an opaque rgb', () => {
    expect(xlsxColourXml('color', '#a1b2c3')).toBe('<color rgb="FFA1B2C3"/>');
  });
});

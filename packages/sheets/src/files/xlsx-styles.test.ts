// docs/specs/029-sheets/standard-mapping.md "Number formats in the file" (D92): ECMA-376's built-in formats read in the
// reader's locale, a cell style naming a format no reader defines left unknown.
import { describe, expect, it } from 'vitest';
import { readCellStyles, xlsxBuiltinCode } from './xlsx-styles';
import { SPREADSHEETML_NS } from './xlsx-parts';

describe('xlsxBuiltinCode', () => {
  it('reads General as none, the standard’s table as its codes, and Excel’s short dates in the locale', () => {
    expect(xlsxBuiltinCode(0, 'en-GB')).toBeNull();
    expect(xlsxBuiltinCode(4, 'en-GB')).toBe('#,##0.00');
    expect(xlsxBuiltinCode(49, 'en-GB')).toBe('@');
    expect(xlsxBuiltinCode(14, 'en-GB')).toBe('dd/mm/yyyy');
    expect(xlsxBuiltinCode(14, 'en-US')).toBe('mm/dd/yyyy');
    expect(xlsxBuiltinCode(22, 'en-GB')).toBe('dd/mm/yyyy hh:mm');
    expect(xlsxBuiltinCode(30, 'en-GB')).toBe('dd/mm/yyyy');
  });

  it('knows no code for the formats the standard leaves to the application', () => {
    expect(xlsxBuiltinCode(5, 'en-GB')).toBeUndefined();
    expect(xlsxBuiltinCode(42, 'en-GB')).toBeUndefined();
  });
});

describe('readCellStyles', () => {
  it('reads each cell style’s code, its own formats over the built-ins, and an undefined one as unknown', () => {
    const xml =
      `<styleSheet xmlns="${SPREADSHEETML_NS}"><numFmts><numFmt numFmtId="164" formatCode="0.0&quot;kg&quot;"/>` +
      '<numFmt numFmtId="4" formatCode="#,##0.000"/></numFmts>' +
      '<cellXfs><xf/><xf numFmtId="164"/><xf numFmtId="4"/><xf numFmtId="14"/><xf numFmtId="7"/></cellXfs></styleSheet>';
    expect(readCellStyles(xml, 'en-GB').map((s) => s.number)).toEqual([
      { code: null },
      { code: '0.0"kg"' },
      { code: '#,##0.000' },
      { code: 'dd/mm/yyyy' },
      { unknown: true },
    ]);
  });

  // standard-mapping.md "Cell styles in the file": each style's look, its colours from the file's theme.
  // standard-mapping.md "The theme in the file" (D218): an untinted theme colour reads as that theme colour, a tinted
  // one as the colour it draws.
  it('reads each cell style’s look, a theme colour by name or, tinted, from the theme part', () => {
    const xml =
      `<styleSheet xmlns="${SPREADSHEETML_NS}"><fonts><font><sz val="10"/><name val="Arial"/></font>` +
      '<font><sz val="10"/><color theme="4"/><name val="Arial"/></font><font><sz val="10"/><color theme="4" tint="0.5"/><name val="Arial"/></font></fonts>' +
      '<cellXfs><xf><alignment vertical="center"/></xf><xf fontId="1"><alignment vertical="center"/><protection locked="0"/></xf><xf fontId="2"><alignment vertical="center"/></xf></cellXfs></styleSheet>';
    const theme =
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme>' +
      '<a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2>' +
      '<a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1></a:clrScheme></a:themeElements></a:theme>';
    expect(readCellStyles(xml, 'en-GB', theme)).toEqual([
      { number: { code: null }, lost: false },
      { number: { code: null }, style: { fc: 'theme:accent1' }, lost: true },
      { number: { code: null }, style: { fc: '#a7c0de' }, lost: false },
    ]);
  });

  it('reads nothing from a part that is absent or unread', () => {
    expect(readCellStyles(undefined, 'en-GB')).toEqual([]);
    expect(readCellStyles('<styleSheet', 'en-GB')).toEqual([]);
  });
});

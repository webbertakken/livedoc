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
    expect(readCellStyles(xml, 'en-GB')).toEqual([
      { code: null },
      { code: '0.0"kg"' },
      { code: '#,##0.000' },
      { code: 'dd/mm/yyyy' },
      { unknown: true },
    ]);
  });

  it('reads nothing from a part that is absent or unread', () => {
    expect(readCellStyles(undefined, 'en-GB')).toEqual([]);
    expect(readCellStyles('<styleSheet', 'en-GB')).toEqual([]);
  });
});

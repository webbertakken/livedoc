// docs/specs/029-sheets/standard-mapping.md "Excel's grammar in detail": Google's syntax to Excel's and back.
import { describe, expect, it } from 'vitest';
import { a1Text, sheetPrefix } from './a1-text';
import {
  dummyFunction,
  fromExcelFormula,
  toExcelFormula,
  unwrapDummyFunction,
} from './excel-formula';
import { reopenRanges, shiftFormulaText } from './formula-text-shift';
import {
  googleNameOfXlsx,
  XLSX_FUTURE_FUNCTIONS,
  XLSX_MISSING_FUNCTIONS,
  xlsxFunctionName,
  xlsxLacks,
} from './xlsx-function-names';
import { FUNCTIONS } from '../formula/registry';
import { GOOGLE_ONLY_FUNCTIONS } from './odf-function-names';

describe('toExcelFormula', () => {
  it.each([
    ['=SUM(A1:B2, 3)', 'SUM(A1:B2, 3)'],
    ['=stdev.s(A1:A3)', '_xlfn.STDEV.S(A1:A3)'],
    ['=FILTER(A1:A3, B1:B3>0)', '_xlfn._xlws.FILTER(A1:A3, B1:B3>0)'],
    ['=SORT(A1:A3)', '_xlfn._xlws.SORT(A1:A3)'],
    ['=SUM(A2:A)', 'SUM(A2:A1048576)'],
    ['=SUM(B2:2)', 'SUM(B2:XFD2)'],
    ['=SUM(A:A, 2:2)', 'SUM(A:A, 2:2)'],
    ['=COUNT(B1#)', 'COUNT(_xlfn.ANCHORARRAY(B1))'],
    ["=SUM('My Sheet'!$A$1)", "SUM('My Sheet'!$A$1)"],
    ['=LAMBDA(x, y, x+y)(1, 2)', '_xlfn.LAMBDA(_xlpm.x, _xlpm.y, _xlpm.x+_xlpm.y)(1, 2)'],
    [
      '=LET(f, LAMBDA(v, v*2), f(3))',
      '_xlfn.LET(_xlpm.f, _xlfn.LAMBDA(_xlpm.v, _xlpm.v*2), _xlpm.f(3))',
    ],
    ['={1, -2; "a", TRUE}', '{1, -2; "a", TRUE}'],
    ['=SUM((A1, B2)) + A1:B2 B1:B3', 'SUM((A1, B2)) + A1:B2 B1:B3'],
    ['=IF(A1, TRUE, FALSE)', 'IF(A1, TRUE, FALSE)'],
    ['=TRUE ', 'TRUE '],
    ['SUM(1)', 'SUM(1)'],
  ])('writes %s as %s', (google, excel) => {
    expect(toExcelFormula(google)).toBe(excel);
  });

  it('names a renamed sheet by its new name (D84)', () => {
    expect(toExcelFormula('=Long!A1+B1', new Map([['Long', 'Short']]))).toBe('Short!A1+B1');
  });

  // D83: what Excel's grammar cannot hold is wrapped whole.
  it.each([
    ['a Google-only function', '=SPLIT(A1, ",")'],
    ['a function Excel lacks', '=EASTERSUNDAY(2024)'],
    ['an array literal of more than constants', '={A1:A3, B1:B3}'],
    ['a formula that does not parse', '=SUM('],
  ])('refuses %s', (_, formula) => {
    expect(toExcelFormula(formula)).toBeNull();
  });
});

describe('S5 in XLSX', () => {
  it('wraps the whole formula with its cached value, as Google Sheets writes it', () => {
    expect(dummyFunction('=SPLIT("a,b", ",")', 'a')).toBe(
      'IFERROR(__xludf.DUMMYFUNCTION("SPLIT(""a,b"", "","")"),"a")',
    );
    expect(dummyFunction('JOIN(1)', 2)).toBe('IFERROR(__xludf.DUMMYFUNCTION("JOIN(1)"),2)');
    expect(dummyFunction('=X()', true)).toContain(',TRUE)');
    expect(dummyFunction('=X()', false)).toContain(',FALSE)');
    expect(dummyFunction('=X()', { e: '#N/A' })).toContain(',#N/A)');
    expect(dummyFunction('=X()', undefined)).toContain(',"")');
  });

  it('unwraps it back to the formula', () => {
    expect(unwrapDummyFunction('IFERROR(__xludf.DUMMYFUNCTION("SPLIT(""a,b"", "","")"),"a")')).toBe(
      '=SPLIT("a,b", ",")',
    );
    expect(unwrapDummyFunction('IFERROR(A1, 2)')).toBeNull();
  });
});

describe('fromExcelFormula', () => {
  it.each([
    ['SUM(A1:B2,3)', '=SUM(A1:B2,3)'],
    ['_xlfn.STDEV.S(A1:A3)', '=STDEV.S(A1:A3)'],
    ['_xlfn._xlws.FILTER(A1:A3,_xlfn.ANCHORARRAY(B1)>0)', '=FILTER(A1:A3,B1#>0)'],
    ["COUNT(_xlfn.ANCHORARRAY('My Sheet'!B1))", "=COUNT('My Sheet'!B1#)"],
    ['_xlfn.LAMBDA(_xlpm.x,_xlpm.x+1)(2)', '=LAMBDA(x,x+1)(2)'],
    ['IFERROR(__xludf.DUMMYFUNCTION("JOIN("","",A1:A2)"),"a,b")', '=JOIN(",",A1:A2)'],
    ['"_xlfn.X"&A1', '="_xlfn.X"&A1'],
  ])('reads %s as %s', (excel, google) => {
    expect(fromExcelFormula(excel)).toBe(google);
  });

  it.each([
    ['a spill of a function', '_xlfn.ANCHORARRAY(INDEX(A1:A3,1))'],
    ['a spill never closed', '_xlfn.ANCHORARRAY(A1'],
  ])('refuses %s', (_, excel) => {
    expect(fromExcelFormula(excel)).toBeNull();
  });

  it('round-trips what it writes', () => {
    for (const google of [
      '=SUM(A1:B2)',
      '=COUNT(B1#)',
      '=LET(a, 1, a+1)',
      '=XLOOKUP(1, A:A, B:B)',
      '=SUM(A2:A) + SUM(B2:2)',
    ])
      expect(fromExcelFormula(toExcelFormula(google)!)).toBe(google);
  });
});

describe('the function names', () => {
  it('prefixes Excel later functions and nothing else', () => {
    expect(xlsxFunctionName('xlookup')).toBe('_xlfn.XLOOKUP');
    expect(xlsxFunctionName('filter')).toBe('_xlfn._xlws.FILTER');
    expect(xlsxFunctionName('Sum')).toBe('Sum');
    expect(googleNameOfXlsx('_xlfn._xlws.SORT')).toBe('SORT');
    expect(googleNameOfXlsx('_XLFN.IFS')).toBe('IFS');
    expect(googleNameOfXlsx('SUM')).toBe('SUM');
  });

  it('holds the functions Excel lacks to functions LiveDoc works out, none of them Excel later ones', () => {
    for (const name of XLSX_MISSING_FUNCTIONS) {
      expect(FUNCTIONS[name]).toBeDefined();
      expect(XLSX_FUTURE_FUNCTIONS.has(name)).toBe(false);
      expect(xlsxLacks(name.toLowerCase())).toBe(true);
    }
    for (const name of GOOGLE_ONLY_FUNCTIONS) expect(xlsxLacks(name)).toBe(true);
    expect(xlsxLacks('SUM')).toBe(false);
  });
});

describe('a1Text', () => {
  it('quotes a sheet Excel would misread as a reference', () => {
    expect(sheetPrefix('R2C3')).toBe("'R2C3'!");
    expect(sheetPrefix('C')).toBe("'C'!");
    expect(sheetPrefix('A1')).toBe("'A1'!");
    expect(sheetPrefix('Costs')).toBe('Costs!');
  });

  it('closes an open range only when asked', () => {
    const ref = { r1: 1, c1: 0, c2: 0, a: 0, open: 'r' as const };
    expect(a1Text(ref, false)).toBe('A2:A');
    expect(a1Text(ref, true)).toBe('A2:A1048576');
  });
});

describe('reopenRanges', () => {
  // standard-mapping.md "Formulas in the file's own syntax": a range to the standards' last row or column is open.
  it.each([
    ['=SUM(A2:A1048576)', '=SUM(A2:A)'],
    ['=SUM(Data!$A$1:$B$1048576)', '=SUM(Data!$A:$B)'],
    ['=SUM(B2:XFD3)', '=SUM(B2:3)'],
    ['=SUM(A2:XFD2)', '=SUM(2:2)'],
    ['=SUM(A1:XFD1)', '=SUM(1:1)'],
    ['=SUM(A1:XFD1048576)', '=SUM(A1:XFD1048576)'],
    ['=SUM(A2:A1000) + A1048576', '=SUM(A2:A1000) + A1048576'],
    ['=SUM(', '=SUM('],
  ])('reads %s as %s', (file, google) => {
    expect(reopenRanges(file)).toBe(google);
  });
});

describe('shiftFormulaText', () => {
  it('moves relative parts and keeps absolute ones', () => {
    expect(shiftFormulaText('=A1+$B$1+C$1+$D1', 2, 1)).toBe('=B3+$B$1+D$1+$D3');
    expect(shiftFormulaText('=SUM(A1:B2)*COUNT(Other!A1#)', 1, 0)).toBe(
      '=SUM(A2:B3)*COUNT(Other!A2#)',
    );
    expect(shiftFormulaText('=SUM(A:A)', 0, 1)).toBe('=SUM(B:B)');
  });

  it('writes a part moved off the grid as #REF!', () => {
    expect(shiftFormulaText('=A1+B2', -1, 0)).toBe('=#REF!+B1');
    expect(shiftFormulaText('=XFD1', 0, 1)).toBe('=#REF!');
  });

  it('leaves a formula that does not parse, or does not move', () => {
    expect(shiftFormulaText('=SUM(', 1, 1)).toBe('=SUM(');
    expect(shiftFormulaText('=A1', 0, 0)).toBe('=A1');
  });
});

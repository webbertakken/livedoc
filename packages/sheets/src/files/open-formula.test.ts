import { describe, expect, it } from 'vitest';
import { fromOpenFormula, toOpenFormula } from './open-formula';

// standard-mapping.md "Formulas in the file's own syntax": an ODF file's formulas are OpenFormula.
describe('toOpenFormula', () => {
  it.each([
    ['=A1*2', 'of:=[.A1]*2'],
    ['=SUM(A1:B2)', 'of:=SUM([.A1:.B2])'],
    ['=SUM($A$1:B$2, 3)', 'of:=SUM([.$A$1:.B$2]; 3)'],
    ['=Sheet2!A1', 'of:=[$Sheet2.A1]'],
    ["='Q3 Costs'!A1:B2", "of:=[$'Q3 Costs'.A1:.B2]"],
    ["='It''s'!A1", "of:=[$'It''s'.A1]"],
    ['=SUM(A:A)', 'of:=SUM([.A:.A])'],
    ['=SUM(2:3)', 'of:=SUM([.2:.3])'],
    ['=SUM(A2:A)', 'of:=SUM([.A2:.A1048576])'],
    ['=SUM(A2:2)', 'of:=SUM([.A2:.XFD2])'],
    ['=IF(TRUE, "a,b", FALSE)', 'of:=IF(TRUE(); "a,b"; FALSE())'],
    ['=TRUE()', 'of:=TRUE()'],
    ['={1, 2; 3, 4}', 'of:={1; 2| 3; 4}'],
    ['="say ""hi"""', 'of:="say ""hi"""'],
    ['=#N/A', 'of:=#N/A'],
  ])('writes %s as %s', (typed, written) => {
    expect(toOpenFormula(typed)).toBe(written);
  });

  it('refuses a formula that does not parse', () => {
    expect(toOpenFormula('=SUM(')).toBeNull();
  });

  it('refuses a spilled range, which OpenFormula cannot say', () => {
    expect(toOpenFormula('=SUM(A1#)')).toBeNull();
  });
});

describe('fromOpenFormula', () => {
  it.each([
    ['of:=[.A1]*2', '=A1*2'],
    ['of:=SUM([.A1:.B2])', '=SUM(A1:B2)'],
    ['of:=SUM([.$A$1:.B$2]; 3)', '=SUM($A$1:B$2, 3)'],
    ['of:=[$Sheet2.A1]', '=Sheet2!A1'],
    ['of:=[Sheet2.A1]', '=Sheet2!A1'],
    ["of:=[$'Q3 Costs'.A1:.B2]", "='Q3 Costs'!A1:B2"],
    ["of:=[$'It''s'.A1]", "='It''s'!A1"],
    ["of:=[$'a:b'.A1]", "='a:b'!A1"],
    ['of:=SUM([.A:.A])', '=SUM(A:A)'],
    ['of:=SUM([.2:.3])', '=SUM(2:3)'],
    ['of:=IF(TRUE(); "a;b"; FALSE( ))', '=IF(TRUE, "a;b", FALSE)'],
    ['of:={1; 2| 3; 4}', '={1, 2; 3, 4}'],
    ['of:=COM.MICROSOFT.IFS([.A1]; 1)', '=COM.MICROSOFT.IFS(A1, 1)'],
    ['=[.A1]+1', '=A1+1'],
  ])('reads %s as %s', (written, typed) => {
    expect(fromOpenFormula(written)).toBe(typed);
  });

  it.each([
    ['another namespace', 'msoxl:=A1'],
    ['no equals sign', 'of:SUM(1)'],
    ['an unclosed string', 'of:="abc'],
    ['an unclosed sheet quote', "of:=[$'abc.A1]"],
    ['a reference it cannot read', 'of:=[.A1:.B2:.C3]'],
    ['a reference with no cell', 'of:=[.]'],
    ['a malformed reference', 'of:=[nonsense]'],
    ['a range across two sheets', 'of:=[$A.A1:$B.B2]'],
  ])('refuses %s', (_, written) => {
    expect(fromOpenFormula(written)).toBeNull();
  });

  it('round-trips what it writes', () => {
    for (const typed of ['=SUM(A1:B2, Sheet2!C3) / 2', "='My Sheet'!$B$4 & \"x\"", '=AVERAGE(1:1)'])
      expect(fromOpenFormula(toOpenFormula(typed)!)).toBe(typed);
  });
});

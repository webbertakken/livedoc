import { describe, expect, it } from 'vitest';
import {
  CONVERSION_CHECK_FAILED,
  conversionChecking,
  conversionLead,
  conversionLine,
  conversionTitle,
  formatName,
} from './conversion-copy';

// docs/specs/029-sheets/files-and-print.md "Converting" (D88): one line a kind, counted, naming up to three.
describe('the conversion dialog’s words', () => {
  it('titles the dialog by why it opened and where it goes', () => {
    expect(conversionTitle('convert', 'xlsx')).toBe('Convert to Excel?');
    expect(conversionTitle('download', 'ods')).toBe('Download as OpenDocument?');
    expect(conversionTitle('download', 'fods')).toBe('Download as OpenDocument?');
    expect(formatName('xlsx')).toBe('Excel');
  });

  it('says what it checks, when the check fails, and what follows', () => {
    expect(conversionChecking('xlsx')).toBe('Checking what the .xlsx file can hold…');
    expect(CONVERSION_CHECK_FAILED).toBe('This spreadsheet could not be checked. Try again.');
    expect(conversionLead('xlsx', [{ k: 'text_cut', count: 1 }])).toBe(
      'The .xlsx file cannot hold:',
    );
    expect(conversionLead('xlsx', [])).toBe(
      'Everything in this spreadsheet fits the Excel format.',
    );
    expect(conversionLead('ods', [])).toBe(
      'Everything in this spreadsheet fits the OpenDocument format.',
    );
  });

  it('names one sheet cut, and up to three of several', () => {
    expect(
      conversionLine({ k: 'sheet_renamed', count: 1, names: [{ from: 'Long', to: 'Lo' }] }, 'xlsx'),
    ).toBe('1 sheet name is cut to Excel’s 31 characters: “Long” becomes “Lo”');
    const names = ['A', 'B', 'C', 'D', 'E'].map((x) => ({ from: `${x}x`, to: x }));
    expect(conversionLine({ k: 'sheet_renamed', count: 2, names: names.slice(0, 2) }, 'xlsx')).toBe(
      '2 sheet names are cut to Excel’s 31 characters: “Ax” becomes “A” and “Bx” becomes “B”',
    );
    expect(conversionLine({ k: 'sheet_renamed', count: 5, names }, 'xlsx')).toBe(
      '5 sheet names are cut to Excel’s 31 characters: “Ax” becomes “A”, “Bx” becomes “B”, “Cx” becomes “C” and 2 more',
    );
  });

  it('names the functions the new format’s apps lack, or none', () => {
    expect(
      conversionLine(
        { k: 'formula_uncalculated', count: 3, functions: ['EUROCONVERT', 'EASTERSUNDAY'] },
        'xlsx',
      ),
    ).toBe(
      '3 formulas keep only their last values in Excel, which has no EUROCONVERT or EASTERSUNDAY',
    );
    expect(conversionLine({ k: 'formula_uncalculated', count: 1, functions: [] }, 'xlsx')).toBe(
      '1 formula keeps only its last value in Excel',
    );
    expect(
      conversionLine(
        { k: 'formula_uncalculated', count: 2, functions: ['A', 'B', 'C', 'D'] },
        'ods',
      ),
    ).toBe('2 formulas keep only their last values in other apps, which have no A, B, C or 1 more');
  });

  it('counts formulas written as values, texts cut and sheets past XFD', () => {
    expect(conversionLine({ k: 'formula_unwritten', count: 1 }, 'ods')).toBe(
      '1 formula is written as its value only',
    );
    expect(conversionLine({ k: 'formula_unwritten', count: 2 }, 'ods')).toBe(
      '2 formulas are written as their values only',
    );
    expect(conversionLine({ k: 'text_cut', count: 1 }, 'xlsx')).toBe(
      '1 cell’s text is cut to Excel’s 32,767 characters',
    );
    expect(conversionLine({ k: 'text_cut', count: 4 }, 'xlsx')).toBe(
      '4 cells’ text is cut to Excel’s 32,767 characters',
    );
    expect(conversionLine({ k: 'columns_cut', count: 1, sheets: ['Wide'] }, 'xlsx')).toBe(
      'Columns past XFD are left out of 1 sheet: Wide',
    );
    expect(conversionLine({ k: 'columns_cut', count: 2, sheets: ['A', 'B'] }, 'xlsx')).toBe(
      'Columns past XFD are left out of 2 sheets: A and B',
    );
  });

  // formulas.md, the file's meaning (D97): formulas whose functions the new format's standard answers differently.
  it('names the formulas that may answer differently in the new format', () => {
    expect(
      conversionLine({ k: 'answers_differ', count: 2, functions: ['CEILING', 'SORT'] }, 'ods'),
    ).toBe('2 formulas may answer differently in OpenDocument: CEILING and SORT');
    expect(conversionLine({ k: 'answers_differ', count: 1, functions: ['SORT'] }, 'xlsx')).toBe(
      '1 formula may answer differently in Excel: SORT',
    );
  });
});

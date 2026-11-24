// What CELL and ISDATE read of a number format (docs/specs/029-sheets/formulas.md "Functions": Information).
import { describe, expect, it } from 'vitest';
import { formatShape } from './format-shape';

const code = (nc: string) => formatShape({ nf: 'custom', nc }).code;

describe('formatShape', () => {
  it('names LiveDoc’s own formats by OpenFormula’s codes', () => {
    expect(formatShape(undefined)).toEqual({
      code: 'G',
      coloured: false,
      bracketed: false,
      date: false,
    });
    expect(formatShape({ nf: 'text' }).code).toBe('G');
    expect(formatShape({ nf: 'accounting', dp: 0 }).code).toBe('C0');
    expect(formatShape({ nf: 'financial' }).code).toBe(',2');
    expect(formatShape({ nf: 'duration' }).code).toBe('D8');
    expect(formatShape({ nf: 'date' }).date).toBe(true);
    expect(formatShape({ nf: 'datetime' })).toMatchObject({ code: 'D4', date: true });
    expect(formatShape({ nf: 'custom' }).code).toBe('G');
  });

  it.each([
    ['0.00', 'F2'],
    ['#,##0.0', ',1'],
    ['0%', 'P0'],
    ['0.00E+00', 'S2'],
    ['£#,##0.00', 'C2'],
    ['"$"0', 'C0'],
    ['@', 'G'],
    ['General', 'G'],
    ['[Blue]0', 'F0'],
    ['0;[Red]-0', 'F0-'],
    ['(0)', 'F0()'],
    ['d-mmm-yy', 'D1'],
    ['d mmm', 'D2'],
    ['mmm yyyy', 'D3'],
    ['dd/mm/yyyy hh:mm', 'D4'],
    ['m/d', 'D5'],
    ['h:mm:ss AM/PM', 'D6'],
    ['h:mm a/p', 'D7'],
    ['hh:mm:ss', 'D8'],
    ['[h]:mm', 'D9'],
    ['mm:ss', 'D8'],
  ])('reads %s as %s', (nc, expected) => {
    expect(code(nc)).toBe(expected);
  });

  it('draws a date only when the code shows a day, a month or a year', () => {
    expect(formatShape({ nf: 'custom', nc: 'yyyy' }).date).toBe(true);
    expect(formatShape({ nf: 'custom', nc: 'hh:mm' }).date).toBe(false);
    expect(formatShape({ nf: 'custom', nc: '0.00' }).date).toBe(false);
  });
});

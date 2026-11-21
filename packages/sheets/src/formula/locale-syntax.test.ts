// Formulas as a locale writes them (docs/specs/029-sheets/formulas.md "Locale", D78).
import { describe, expect, it } from 'vitest';
import {
  argumentSeparatorOf,
  formulaFromLocale,
  formulaSyntaxOf,
  formulaToLocale,
} from './locale-syntax';

describe('formulaSyntaxOf', () => {
  it('follows the locale’s own decimal mark', () => {
    expect(formulaSyntaxOf('en-US')).toBe('point');
    expect(formulaSyntaxOf('en-GB')).toBe('point');
    expect(formulaSyntaxOf('ja-JP')).toBe('point');
    expect(formulaSyntaxOf('de-DE')).toBe('comma');
    expect(formulaSyntaxOf('fr-FR')).toBe('comma');
    expect(formulaSyntaxOf('nl-NL')).toBe('comma');
  });

  it('reads a locale it does not know as en (D81)', () => {
    expect(formulaSyntaxOf('not a locale')).toBe('point');
  });

  it('names the separator between arguments', () => {
    expect(argumentSeparatorOf('point')).toBe(',');
    expect(argumentSeparatorOf('comma')).toBe(';');
  });
});

describe('formulaFromLocale', () => {
  it('keeps the point syntax as it is', () => {
    expect(formulaFromLocale('=ROUND(1.5, 0)', 'point')).toEqual({
      ok: true,
      text: '=ROUND(1.5, 0)',
    });
  });

  it('reads decimal commas, ; between arguments and \\ between columns', () => {
    expect(formulaFromLocale('=ROUND(1,5; 0)', 'comma')).toEqual({
      ok: true,
      text: '=ROUND(1.5, 0)',
    });
    expect(formulaFromLocale('={1\\2; 3\\4}', 'comma')).toEqual({ ok: true, text: '={1,2; 3,4}' });
    expect(formulaFromLocale('={SUM(1;2)\\3}', 'comma')).toEqual({
      ok: true,
      text: '={SUM(1,2),3}',
    });
    expect(formulaFromLocale('=SUM({1,5\\2};3)', 'comma')).toEqual({
      ok: true,
      text: '=SUM({1.5,2},3)',
    });
    expect(formulaFromLocale('=2,5E2+1E-3', 'comma')).toEqual({ ok: true, text: '=2.5E2+1E-3' });
  });

  it('never touches quoted text, sheet names or words', () => {
    expect(formulaFromLocale('=IF(A1;"a,b;c\\d";\'x,y\'!B2)', 'comma')).toEqual({
      ok: true,
      text: '=IF(A1,"a,b;c\\d",\'x,y\'!B2)',
    });
    expect(formulaFromLocale('=LOG10(A1:B2)+Sheet1!$C$3', 'comma')).toEqual({
      ok: true,
      text: '=LOG10(A1:B2)+Sheet1!$C$3',
    });
    expect(formulaFromLocale('="say ""1,5"""&1,5', 'comma')).toEqual({
      ok: true,
      text: '="say ""1,5"""&1.5',
    });
  });

  it('keeps a ; outside brackets and a \\ outside braces for the parser to judge', () => {
    expect(formulaFromLocale('=1;2', 'comma')).toEqual({ ok: true, text: '=1;2' });
    expect(formulaFromLocale('=\\name', 'comma')).toEqual({ ok: true, text: '=\\name' });
  });

  it('refuses a comma outside a number, and a point, where they are', () => {
    expect(formulaFromLocale('=SUM(A1,B1)', 'comma')).toEqual({ ok: false, at: 7 });
    expect(formulaFromLocale('=1.5', 'comma')).toEqual({ ok: false, at: 2 });
    expect(formulaFromLocale('=1,', 'comma')).toEqual({ ok: false, at: 2 });
  });
});

describe('formulaToLocale', () => {
  it('keeps the point syntax as it is', () => {
    expect(formulaToLocale('=ROUND(1.5, 0)', 'point')).toBe('=ROUND(1.5, 0)');
  });

  it('writes decimal commas, ; between arguments and \\ between columns', () => {
    expect(formulaToLocale('=ROUND(1.5, 0)', 'comma')).toBe('=ROUND(1,5; 0)');
    expect(formulaToLocale('={1, 2; 3, 4}', 'comma')).toBe('={1\\ 2; 3\\ 4}');
    expect(formulaToLocale('={SUM(1,2),3}', 'comma')).toBe('={SUM(1;2)\\3}');
    expect(formulaToLocale('=SUM((A1:A3, C1:C3))', 'comma')).toBe('=SUM((A1:A3; C1:C3))');
    expect(formulaToLocale('=IF(A1,"a,b",1.5E+2)', 'comma')).toBe('=IF(A1;"a,b";1,5E+2)');
  });

  it('writes .5 and 1. so they read back', () => {
    expect(formulaToLocale('=.5+1.', 'comma')).toBe('=0,5+1');
    expect(formulaToLocale('=1.e2', 'comma')).toBe('=1e2');
    expect(formulaToLocale('=1+.', 'comma')).toBe('=1+.');
  });

  it('leaves a comma outside brackets as it is', () => {
    expect(formulaToLocale('=1,2', 'comma')).toBe('=1,2');
  });

  it('reads back what it writes', () => {
    for (const stored of ['=SUMPRODUCT({1.5,2;3,4.25}, A1:B2)', '=IF(TRUE, "x,y", -0.75)']) {
      expect(formulaFromLocale(formulaToLocale(stored, 'comma'), 'comma')).toEqual({
        ok: true,
        text: stored,
      });
    }
  });
});

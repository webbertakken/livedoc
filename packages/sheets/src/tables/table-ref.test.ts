// Table references' grammar (docs/specs/029-sheets/formulas.md "Table references"): read and written back.
import { describe, expect, it } from 'vitest';
import { parseFormula } from '../formula/parse';
import { tokenize } from '../formula/tokens';
import { formatTableRef, parseTableRef, TableArea } from './table-ref';

const { headers: H, data: D, totals: T, thisRow: R } = TableArea;

describe('parseTableRef', () => {
  it('reads a column, a part and the whole data', () => {
    expect(parseTableRef('Sales[Amount]')).toEqual({
      table: 'Sales',
      cols: ['Amount', 'Amount'],
      area: D,
    });
    expect(parseTableRef('Sales[#ALL]')).toEqual({ table: 'Sales', cols: null, area: H | D | T });
    expect(parseTableRef('Sales[#headers]')).toEqual({ table: 'Sales', cols: null, area: H });
    expect(parseTableRef('Sales[#Totals]')).toEqual({ table: 'Sales', cols: null, area: T });
    expect(parseTableRef('Sales[#DATA]')).toEqual({ table: 'Sales', cols: null, area: D });
    expect(parseTableRef('Sales[]')).toEqual({ table: 'Sales', cols: null, area: D });
  });

  it('reads lists of parts and a span of columns, spaces around them left out', () => {
    expect(parseTableRef('Sales[[#HEADERS],[#DATA]]')).toEqual({
      table: 'Sales',
      cols: null,
      area: H | D,
    });
    expect(parseTableRef('Sales[[#DATA],[#TOTALS]]')).toEqual({
      table: 'Sales',
      cols: null,
      area: D | T,
    });
    expect(parseTableRef('Sales[ [#ALL] , [Amount] : [Unit price] ]')).toEqual({
      table: 'Sales',
      cols: ['Amount', 'Unit price'],
      area: H | D | T,
    });
    expect(parseTableRef('Sales[[Amount]:[Tax]]')).toEqual({
      table: 'Sales',
      cols: ['Amount', 'Tax'],
      area: D,
    });
  });

  it("reads Excel's this row, with and without the table's name", () => {
    expect(parseTableRef('[@Amount]')).toEqual({
      table: null,
      cols: ['Amount', 'Amount'],
      area: R,
    });
    expect(parseTableRef('Sales[@[Unit price]]')).toEqual({
      table: 'Sales',
      cols: ['Unit price', 'Unit price'],
      area: R,
    });
    expect(parseTableRef('Sales[[#This Row],[Amount]]')).toEqual({
      table: 'Sales',
      cols: ['Amount', 'Amount'],
      area: R,
    });
    expect(parseTableRef('Sales[@[A]:[B]]')).toEqual({ table: 'Sales', cols: ['A', 'B'], area: R });
    expect(parseTableRef('Sales[@]')).toEqual({ table: 'Sales', cols: null, area: R });
  });

  it('takes escapes off column names', () => {
    expect(parseTableRef("Sales['#Sold]")!.cols).toEqual(['#Sold', '#Sold']);
    expect(parseTableRef("Sales[[#ALL],[It''s '[x']]]")!.cols).toEqual(["It's [x]", "It's [x]"]);
  });

  it('refuses what is not a table reference', () => {
    for (const text of [
      'Sales',
      '1x[A]',
      'Sales[[#ALL],[#HEADERS]]',
      'Sales[[#HEADERS],[#TOTALS]]',
      'Sales[[A],[B]]',
      'Sales[[A]:[#ALL]]',
      'Sales[@[#ALL]]',
      'Sales[[#This Row],[#DATA]]',
      'Sales[[A]x]',
      'Sales[[A]:x]',
      'Sales[[]]',
      'Sales[A]]',
      'Sales[[A]:[]]',
      'Sales[A[B]',
      'Sales[[A]',
      'Sales[[A[x]]]',
    ])
      expect(parseTableRef(text), text).toBeNull();
  });
});

describe('formatTableRef', () => {
  it("writes each reference in Google's text, which reads back the same", () => {
    const cases: [readonly [string, string] | null, number, string][] = [
      [null, D, 'Sales'],
      [['Amount', 'Amount'], D, 'Sales[Amount]'],
      [['Amount', 'Tax'], D, 'Sales[[Amount]:[Tax]]'],
      [null, H | D | T, 'Sales[#ALL]'],
      [null, H, 'Sales[#HEADERS]'],
      [null, T, 'Sales[#TOTALS]'],
      [null, H | D, 'Sales[[#HEADERS],[#DATA]]'],
      [['Amount', 'Amount'], H | D | T, 'Sales[[#ALL],[Amount]]'],
      [['Amount', 'Tax'], D | T, 'Sales[[#DATA],[#TOTALS],[Amount]:[Tax]]'],
      [['Amount', 'Amount'], R, 'Sales[@Amount]'],
      [['Unit price', 'Unit price'], R, 'Sales[@[Unit price]]'],
      [['A', 'B'], R, 'Sales[@[A]:[B]]'],
      [null, R, 'Sales[@]'],
      [['#Sold', '#Sold'], D, "Sales['#Sold]"],
    ];
    for (const [cols, area, text] of cases) {
      expect(formatTableRef('Sales', cols, area)).toBe(text);
      if (text !== 'Sales') expect(parseTableRef(text)).toEqual({ table: 'Sales', cols, area });
    }
  });
});

describe('a table reference as a token', () => {
  it('is one token, its brackets whole', () => {
    const toks = tokenize('SUM(Sales[[#ALL],[Amount]])+[@Tax]').filter((t) => t.k === 'table');
    expect(toks.map((t) => t.v)).toEqual(['Sales[[#ALL],[Amount]]', '[@Tax]']);
  });

  it('leaves brackets that never close, or nest too deep, to the parser, which refuses them', () => {
    expect(tokenize('Sales[[A]').map((t) => t.k)).toEqual(['ident', 'bad', 'table']);
    for (const text of ['=Sales[[A]', '=Sales[[[A]]]', '=Sales[[A]x]', '=[', '=Sales[x'])
      expect(parseFormula(text).ok, text).toBe(false);
  });
});

// The language's own semantics beyond the oracle's reach (docs/specs/029-sheets/formulas.md "Reference operators",
// "Arrays and spills", "Errors"): the operators Google refuses but files bring, and both array dialects.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';

const grid = {
  A1: '1',
  A2: '2',
  A3: '3',
  B1: '10',
  B2: '20',
  B3: '30',
  C1: '100',
};

describe('reference operators', () => {
  // formulas.md "Reference operators": `:` between expressions spans both.
  it('spans two references, whatever gives them', () => {
    const b = book({ ...grid, E1: '=SUM(A1:INDEX(A1:A3, 2))', E2: '=SUM(A1:B2:A3)' });
    expect(b.v('E1')).toBe(3);
    expect(b.v('E2')).toBe(66);
  });

  it('refuses to span what is no reference, or two sheets', () => {
    const b = book({
      One: { A1: '1', E1: '=SUM(ABS(1):A3)', E2: '=SUM(A1:Two!A1)' },
      Two: { A1: '2' },
    });
    expect(b.v('E1', 'One')).toMatchObject({ e: '#VALUE!' });
    expect(b.v('E2', 'One')).toMatchObject({
      e: '#VALUE!',
      why: 'A range joins two cells of one sheet',
    });
  });

  it('intersects with a space, #NULL! when nothing is shared', () => {
    const b = book({ ...grid, E1: '=SUM(A1:B3 B2:C3)', E2: '=A1:A3 B1:B3', E3: '=ERROR.TYPE(E2)' });
    expect(b.v('E1')).toBe(50);
    expect(b.v('E2')).toMatchObject({ e: '#NULL!' });
    expect(b.v('E3')).toBe(1);
  });

  it('reads a union in the functions that take references, #VALUE! elsewhere', () => {
    const b = book({
      ...grid,
      E1: '=SUM((A1:A2, B3, C1))',
      E2: '=COUNTA((A1:A3, B1))',
      E3: '=(A1, B1)+1',
      E4: '=SUM((A1, ABS(1)))',
      E5: '=SUM((A1, (B1, B2)))',
    });
    expect(b.v('E1')).toBe(133);
    expect(b.v('E2')).toBe(4);
    expect(b.v('E3')).toMatchObject({
      e: '#VALUE!',
      why: 'A list of references gives no single value',
    });
    expect(b.v('E4')).toMatchObject({ e: '#VALUE!' });
    expect(b.v('E5')).toBe(31);
  });

  it('passes an error given where a reference goes', () => {
    const b = book({ ...grid, E1: '=SUM(A1:INDEX(A1:A3, 9))', E2: '=SUM((A1, INDEX(A1:A3, 9)))' });
    expect(b.v('E1')).toMatchObject({ e: '#REF!' });
    expect(b.v('E2')).toMatchObject({ e: '#REF!' });
  });
});

describe('array literals', () => {
  // formulas.md "Operators": slots hold any expression; ranges join side by side and stack.
  it('joins ranges and values', () => {
    const b = book({
      ...grid,
      E1: '={A1:A2, B1:B2}',
      E4: '={A1:B1; 7, 8}',
      E6: '=SUM({A1:A3; B1:B3})',
    });
    expect(b.wb.formulaResult(b.sheets[0]!.id, 0, 4)).toEqual({
      rows: [
        [1, 10],
        [2, 20],
      ],
    });
    expect(b.wb.formulaResult(b.sheets[0]!.id, 3, 4)).toEqual({
      rows: [
        [1, 10],
        [7, 8],
      ],
    });
    expect(b.v('E6')).toBe(66);
  });

  it('refuses parts that do not line up, and passes an error', () => {
    const ragged = 'In ARRAY_LITERAL, an Array Literal was missing values for one or more rows.';
    const b = book({ ...grid, E1: '={A1:A2, B1}', E2: '={1, 2; 3}', E3: '={1, 1/0}' });
    expect(b.v('E1')).toMatchObject({ e: '#VALUE!', why: ragged });
    expect(b.v('E2')).toMatchObject({ e: '#VALUE!', why: ragged });
    expect(b.v('E3')).toMatchObject({ e: '#DIV/0!' });
  });
});

describe('implicit intersection', () => {
  // formulas.md "Arrays and spills": a spreadsheet intersects a range where one value goes.
  it("reads the cell in the formula's row or column, in a spreadsheet", () => {
    const b = book(
      {
        ...grid,
        E2: '=A1:A3*2',
        E3: '=LEN(B1:B3)',
        B5: '=A1:C1+1',
        E5: '=A1:A3*2',
        E6: '=A1:B3+1',
      },
      { arrays: 'google' },
    );
    expect(b.v('E2')).toBe(4);
    expect(b.v('E3')).toBe(2);
    expect(b.v('B5')).toBe(11);
    expect(b.v('E5')).toMatchObject({ e: '#VALUE!', why: 'An array value could not be found' });
    expect(b.v('E6')).toMatchObject({ e: '#VALUE!' });
  });

  it('takes ranges whole in an array context, and a bare range spills', () => {
    const b = book(
      {
        ...grid,
        E1: '=ARRAYFORMULA(A1:A3*2)',
        F1: '=SUMPRODUCT((A1:A3>1)*B1:B3)',
        G1: '=A1:A2',
        H1: '={A1:A2*2}',
      },
      { arrays: 'google' },
    );
    const id = b.sheets[0]!.id;
    expect(b.wb.formulaResult(id, 0, 4)).toEqual({ rows: [[2], [4], [6]] });
    expect(b.v('F1')).toBe(50);
    expect(b.wb.formulaResult(id, 0, 6)).toEqual({ rows: [[1], [2]] });
    expect(b.wb.formulaResult(id, 0, 7)).toEqual({ rows: [[2], [4]] });
  });

  it("keeps a Plan Sheet's ranges whole everywhere", () => {
    const b = book({ ...grid, E1: '=A1:A3*2' });
    expect(b.wb.arrays).toBe('dynamic');
    expect(b.wb.formulaResult(b.sheets[0]!.id, 0, 4)).toEqual({ rows: [[2], [4], [6]] });
  });
});

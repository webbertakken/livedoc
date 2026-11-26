// Validation rules between the model and a file (docs/specs/029-sheets/standard-mapping.md "Validation in the file",
// D293): positions, sources as text, formulas in Google's syntax for the top-left cell, and the read rules made again
// on the grid, one a rectangle, cut, moved, checked, and named when they cannot be made.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { compileFormula } from '../formula/stored';
import type { IdRange, ValidationRule } from '../sheet';
import type { FileLoss } from './workbook-file';
import {
  fileValidationRulesOf,
  validationRulesFromFile,
  type FileValidationRule,
} from './file-validation';

const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;
const box = (r1: number, c1: number, r2: number, c2: number): IdRange => ({
  r1: R(r1),
  c1: C(c1),
  r2: R(r2),
  c2: C(c2),
});

function setup(rows = 10) {
  const b = book({ One: {}, 'My Lists': {} }, { rows, cols: 4 });
  const sheet = b.sheets[0]!;
  const other = b.sheets[1]!;
  const ctx = b.wb.ctxFor(sheet.id);
  return { b, sheet, other, ctx };
}

describe('the model as a file holds it', () => {
  it('writes each rule by position, its source as text and its formula in Google syntax', () => {
    const { sheet, other, ctx } = setup();
    const fx = compileFormula('=B2>A2', ctx);
    if (!fx.ok) throw new Error('compile');
    const otherBox = { ...box(0, 0, 2, 0), r1: 's1r0', c1: 's1c0', r2: 's1r2', c2: 's1c0' };
    const rules: ValidationRule[] = [
      {
        id: 'v1',
        ...box(1, 0, 4, 0),
        is: 'list',
        opts: [{ v: 'To Do', c: '#ff0000' }, { v: 'Done' }],
        show: 'arrow',
        multi: true,
        help: 'Pick one',
      },
      { id: 'v2', ...box(1, 1, 4, 1), is: 'range', src: { ...otherBox, s: other.id } },
      { id: 'v3', ...box(1, 2, 4, 2), is: 'range', src: box(0, 3, 0, 3) },
      { id: 'v4', ...box(5, 0, 5, 0), is: 'formula', fx: fx.formula, warn: true },
      { id: 'v5', ...box(6, 0, 6, 0), is: 'range', src: { ...box(0, 0, 0, 0), s: 'gone' } },
      { id: 'v6', ...box(7, 0, 7, 0), r1: 'gone00', is: 'check' },
    ];
    const layout = { ...sheet.layout, rules };
    expect(fileValidationRulesOf(layout, ctx)).toEqual([
      {
        ranges: [{ r1: 1, c1: 0, r2: 4, c2: 0 }],
        is: 'list',
        opts: [{ v: 'To Do', c: '#ff0000' }, { v: 'Done' }],
        show: 'arrow',
        multi: true,
        help: 'Pick one',
      },
      { ranges: [{ r1: 1, c1: 1, r2: 4, c2: 1 }], is: 'range', src: "'My Lists'!A1:A3" },
      { ranges: [{ r1: 1, c1: 2, r2: 4, c2: 2 }], is: 'range', src: 'D1' },
      { ranges: [{ r1: 5, c1: 0, r2: 5, c2: 0 }], is: 'formula', fx: '=B2>A2', warn: true },
      { ranges: [{ r1: 6, c1: 0, r2: 6, c2: 0 }], is: 'range' },
    ]);
    expect(fileValidationRulesOf(sheet.layout, ctx)).toBeUndefined();
  });
});

describe('a file’s rules made on the grid', () => {
  const read = (rules: FileValidationRule[], rows = 10) => {
    const { b, sheet, ctx } = setup(rows);
    const losses: FileLoss[] = [];
    let n = 1;
    const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
    const made = validationRulesFromFile(rules, sheet.layout, ctx, 'One', rand, losses);
    return { made, losses, b, ctx };
  };

  it('makes one rule a rectangle, its formula moved to each top-left cell, its source found by title', () => {
    const { made, losses, ctx } = read([
      {
        ranges: [
          { r1: 1, c1: 0, r2: 2, c2: 0 },
          { r1: 5, c1: 2, r2: 5, c2: 3 },
        ],
        is: 'formula',
        fx: '=B2>A2',
      },
      { ranges: [{ r1: 1, c1: 1, r2: 3, c2: 1 }], is: 'range', src: "'My Lists'!A1:A3" },
    ]);
    expect(losses).toEqual([]);
    expect(made).toHaveLength(3);
    expect(made![0]).toMatchObject({ ...box(1, 0, 2, 0), is: 'formula' });
    expect(made![1]).toMatchObject({ ...box(5, 2, 5, 3), is: 'formula' });
    const again = fileValidationRulesOf({ ...setup().sheet.layout, rules: made }, ctx);
    expect(again![1]!.fx).toBe('=D6>C6');
    expect(made![2]!.src).toMatchObject({ r1: 's1r0', c2: 's1c0', s: expect.any(String) });
    expect(new Set(made!.map((x) => x.id)).size).toBe(3);
  });

  it('cuts a rule to the grid and names one off it, over another, or not a rule', () => {
    const { made, losses } = read([
      { ranges: [{ r1: 8, c1: 0, r2: 99, c2: 0 }], is: 'check' },
      { ranges: [{ r1: 50, c1: 0, r2: 60, c2: 0 }], is: 'check' },
      { ranges: [{ r1: 9, c1: 0, r2: 9, c2: 1 }], is: 'check' },
      { ranges: [{ r1: 0, c1: 2, r2: 0, c2: 2 }], is: 'list', opts: [] },
      { ranges: [{ r1: 0, c1: 3, r2: 0, c2: 3 }], is: 'range', src: 'Nowhere!A1' },
      { ranges: [{ r1: 1, c1: 3, r2: 1, c2: 3 }], is: 'formula', fx: '=SUM(' },
    ]);
    expect(made).toEqual([expect.objectContaining({ ...box(8, 0, 9, 0), is: 'check' })]);
    expect(losses.map((l) => l.k === 'validation_rule_unread' && [l.r, l.c])).toEqual([
      [50, 0],
      [9, 0],
      [0, 2],
      [0, 3],
      [1, 3],
    ]);
  });

  it('stops at the most rules a sheet holds', () => {
    const many: FileValidationRule[] = Array.from({ length: 201 }, (_, i) => ({
      ranges: [{ r1: i, c1: 0, r2: i, c2: 0 }],
      is: 'check',
    }));
    const { made, losses } = read(many, 300);
    expect(made).toHaveLength(200);
    expect(losses).toEqual([{ k: 'validation_rule_unread', sheet: 'One', r: 200, c: 0 }]);
    expect(read([]).made).toBeUndefined();
  });
});

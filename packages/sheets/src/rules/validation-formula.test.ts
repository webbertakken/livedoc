// A Custom Formula Is validation rule worked out by the workbook (data-validation.md "Where values are checked").
import { describe, expect, it } from 'vitest';
import { applySheetWrite, type SheetWrite } from '../store';
import { validateWrite } from '../validate';
import { compileFormula } from '../formula/stored';
import { book } from '../testing/book';
import type { ValidationRule } from '../sheet';
import { validationFormulaAllows, workbookRuleChecks } from './validation-formula';
import { valueInvalid } from './validation';

const by = { id: 'p', name: 'P', color: '#000000' };
const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;

// A Custom Formula Is rule over B1:B5 written for B1.
function ruled(cells: Record<string, string>, formula: string) {
  const b = book(cells, { rows: 10, cols: 4 });
  const sheet = b.sheets[0]!;
  const fx = compileFormula(formula, b.wb.ctxFor(sheet.id));
  if (!fx.ok) throw new Error('compile');
  const rule: ValidationRule = {
    id: 'rule01',
    r1: R(0),
    c1: C(1),
    r2: R(4),
    c2: C(1),
    is: 'formula',
    fx: fx.formula,
  };
  const write: SheetWrite = { kind: 'layout', changes: [{ k: 'vrule', id: rule.id, rule }] };
  const next = applySheetWrite(sheet, write, { now: 1, by }).sheet;
  b.wb.updateSheet(next);
  return { b, sheet: next, rule, allows: validationFormulaAllows(b.wb, next.id) };
}

describe('a custom formula validation rule', () => {
  it('works the formula out with the cell read as the new value, moved to each cell', () => {
    const { allows, rule } = ruled({ A1: '5', A2: '50' }, '=B1>A1');
    expect(allows(rule, 0, 1, 6)).toBe(true);
    expect(allows(rule, 0, 1, 1)).toBe(false);
    expect(allows(rule, 1, 1, 6)).toBe(false);
    expect(allows(rule, 1, 1, 60)).toBe(true);
  });
  it('reaches the formulas between it and the cell', () => {
    const { allows, rule } = ruled({ C1: '=B1*2' }, '=C1>10');
    expect(allows(rule, 0, 1, 6)).toBe(true);
    expect(allows(rule, 0, 1, 4)).toBe(false);
  });
  it('refuses on an error or text, and marks a cell as it is', () => {
    const { allows, rule, b, sheet } = ruled({ B1: '3', B2: '30' }, '=IF(B1>10, TRUE, 1/0)');
    expect(allows(rule, 0, 1, 3)).toBe(false);
    const ctx = { locale: 'en-GB', layout: sheet.layout, formulaAllows: allows };
    expect(valueInvalid(rule, 3, '3', ctx, { r: 0, c: 1 })).toBe(true);
    expect(valueInvalid(rule, 30, '30', ctx, { r: 1, c: 1 })).toBe(false);
    // The workbook's own values are untouched by a check.
    allows(rule, 1, 1, 1);
    expect(b.wb.value(sheet.id, 1, 1)).toBe(30);
  });
  it('refuses a write the editor checks, naming the cell', () => {
    const { b, sheet } = ruled({ A1: '5' }, '=B1>A1');
    const w: SheetWrite = { kind: 'cells', cells: [{ r: R(0), c: C(1), i: { n: 2 } }] };
    expect(validateWrite(sheet, w).ok).toBe(true);
    expect(validateWrite(sheet, w, workbookRuleChecks(b.wb, sheet.id))).toMatchObject({
      ok: false,
      error: 'value_invalid',
      at: `${R(0)}:${C(1)}`,
      line: "Enter a value that meets the rule's formula",
    });
  });
});

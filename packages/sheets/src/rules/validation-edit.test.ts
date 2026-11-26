// Making and removing validation rules, and the checkbox toggle (docs/specs/029-sheets/data-validation.md "Making and
// changing rules", "Using a checkbox").
import { describe, expect, it } from 'vitest';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from '../store';
import { posRangeOf } from '../layout';
import { compileFormula } from '../formula/stored';
import { book, makeSheets } from '../testing/book';
import type { GridRange } from '../address';
import type { Sheet } from '../sheet';
import {
  removeValidation,
  selectionHasCheckbox,
  setValidationRule,
  subtractRect,
  toggleCheckboxes,
} from './validation-edit';

const by = { id: 'p', name: 'P', color: '#000000' };
const g = (r1: number, c1: number, r2 = r1, c2 = c1): GridRange => ({ r1, c1, r2, c2 });
const apply = (s: Sheet, w: SheetWrite) => applySheetWrite(s, w, { now: 1, by }).sheet;
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280), n / 233280);
const base = (): Sheet => makeSheets({ 'Sheet 1': {} }, { rows: 12, cols: 6 })[0]!;
const ranges = (s: Sheet) =>
  (s.layout.rules ?? []).map((x) => ({ ...posRangeOf(s.layout, x), is: x.is }));

describe('subtractRect', () => {
  it('leaves the bands around the overlap', () => {
    expect(subtractRect(g(0, 0, 9, 9), g(20, 20))).toEqual([g(0, 0, 9, 9)]);
    expect(subtractRect(g(0, 0, 9, 9), g(0, 0, 9, 9))).toEqual([]);
    expect(subtractRect(g(0, 0, 9, 9), g(3, 3, 5, 5))).toEqual([
      g(0, 0, 2, 9),
      g(6, 0, 9, 9),
      g(3, 0, 5, 2),
      g(3, 6, 5, 9),
    ]);
    expect(subtractRect(g(0, 0, 9, 0), g(5, 0, 20, 4))).toEqual([g(0, 0, 4, 0)]);
  });
});

describe('a rule over a range', () => {
  it('replaces what it covers and keeps the rest of a partly covered rule', () => {
    const one = setValidationRule(base().layout, g(0, 1, 9, 1), { is: 'check' }, rand)!;
    const s1 = apply(base(), one.write);
    expect(ranges(s1)).toEqual([{ r1: 0, c1: 1, r2: 9, c2: 1, is: 'check' }]);
    const two = setValidationRule(
      s1.layout,
      g(3, 0, 4, 2),
      { is: 'list', opts: [{ v: 'A' }] },
      rand,
    )!;
    const s2 = apply(s1, two.write);
    expect(ranges(s2)).toEqual([
      { r1: 0, c1: 1, r2: 2, c2: 1, is: 'check' },
      { r1: 5, c1: 1, r2: 9, c2: 1, is: 'check' },
      { r1: 3, c1: 0, r2: 4, c2: 2, is: 'list' },
    ]);
    // One undo step puts the first rule back whole.
    const r = applySheetWrite(s1, two.write, { now: 1, by });
    expect(ranges(apply(r.sheet, inverseSheetWrite(s1, r)))).toEqual(ranges(s1));
  });
  it('edits a rule in place by its id, its own cells not split', () => {
    const one = setValidationRule(base().layout, g(0, 1, 9, 1), { is: 'check' }, rand)!;
    const s1 = apply(base(), one.write);
    const edit = setValidationRule(
      s1.layout,
      g(0, 1, 5, 1),
      { is: 'num', op: 'gt', a: 1 },
      rand,
      one.id,
    )!;
    expect(edit.id).toBe(one.id);
    const s2 = apply(s1, edit.write);
    expect(ranges(s2)).toEqual([{ r1: 0, c1: 1, r2: 5, c2: 1, is: 'num' }]);
  });
  it('is nothing off the grid', () => {
    expect(setValidationRule({ rows: [], cols: [] }, g(0, 0), { is: 'check' })).toBeNull();
  });
});

describe('Remove Validation', () => {
  it('takes the selection out of every rule, and is nothing where there are none', () => {
    const s1 = apply(
      base(),
      setValidationRule(base().layout, g(0, 0, 9, 3), { is: 'check' }, rand)!.write,
    );
    const w = removeValidation(s1.layout, [g(0, 0, 9, 1)], rand)!;
    expect(ranges(apply(s1, w))).toEqual([{ r1: 0, c1: 2, r2: 9, c2: 3, is: 'check' }]);
    expect(removeValidation(s1.layout, [g(11, 5)], rand)).toBeNull();
  });
});

describe('the checkbox toggle', () => {
  const ticked = () => {
    const b = book({ B1: 'TRUE', B2: 'FALSE', B4: '=TRUE' }, { rows: 8, cols: 4 });
    const sheet = b.sheets[0]!;
    const next = apply(
      sheet,
      setValidationRule(sheet.layout, g(0, 1, 5, 1), { is: 'check' }, rand)!.write,
    );
    b.wb.updateSheet(next);
    return { b, sheet: next };
  };
  it('ticks every box when any is unticked, else unticks them all, leaving formulas alone', () => {
    const { b, sheet } = ticked();
    expect(selectionHasCheckbox(sheet.layout, [g(0, 0, 7, 0)])).toBe(false);
    expect(selectionHasCheckbox(sheet.layout, [g(0, 0, 7, 3)])).toBe(true);
    const w = toggleCheckboxes(b.wb, sheet.id, [g(0, 0, 7, 3)])!;
    expect(w.kind === 'cells' && w.cells.map((c) => c.i)).toEqual([
      { b: true },
      { b: true },
      { b: true },
      { b: true },
      { b: true },
    ]);
    const one = toggleCheckboxes(b.wb, sheet.id, [g(0, 1)])!;
    expect(one.kind === 'cells' && one.cells[0]!.i).toEqual({ b: false });
    expect(toggleCheckboxes(b.wb, sheet.id, [g(0, 0)])).toBeNull();
    expect(toggleCheckboxes(b.wb, sheet.id, [g(3, 1)])).toBeNull();
    expect(toggleCheckboxes(b.wb, 'nope', [g(0, 1)])).toBeNull();
  });
});

describe('custom checkbox values and formulas in edits', () => {
  it('ticks with the ticked value and unticks with the unticked one, or empties the cell', () => {
    const b = book({ B1: 'Yes', B2: 'no', B3: 'x', C1: 'TRUE' }, { rows: 8, cols: 4 });
    const sheet = b.sheets[0]!;
    const yes = setValidationRule(
      sheet.layout,
      g(0, 1, 5, 1),
      { is: 'check', on: 'Yes', off: 'No' },
      rand,
    )!;
    const s1 = apply(sheet, yes.write);
    const one = setValidationRule(s1.layout, g(0, 2, 5, 2), { is: 'check', on: 1 }, rand)!;
    const s2 = apply(s1, one.write);
    b.wb.updateSheet(s2);
    const id = (r: number, c: number) => `${s2.layout.rows[r]}:${s2.layout.cols[c]}`;
    const cells = (w: SheetWrite | null) =>
      w?.kind === 'cells' ? w.cells.map((ch) => [`${ch.r}:${ch.c}`, ch.i]) : null;
    // B2 is unticked, so all tick; C1 holds TRUE, which a custom checkbox does not read as ticked.
    expect(cells(toggleCheckboxes(b.wb, s2.id, [g(0, 1, 1, 2)]))).toEqual([
      [id(0, 1), { s: 'Yes' }],
      [id(1, 1), { s: 'Yes' }],
      [id(0, 2), { n: 1 }],
      [id(1, 2), { n: 1 }],
    ]);
    expect(cells(toggleCheckboxes(b.wb, s2.id, [g(0, 1)]))).toEqual([[id(0, 1), { s: 'No' }]]);
    const ticked = apply(s2, {
      kind: 'cells',
      cells: [{ r: s2.layout.rows[0]!, c: s2.layout.cols[2]!, i: { n: 1 } }],
    });
    b.wb.updateSheet(ticked);
    expect(cells(toggleCheckboxes(b.wb, s2.id, [g(0, 2)]))).toEqual([[id(0, 2), null]]);
  });
  it('moves a custom formula to the top-left of each piece a covering rule leaves', () => {
    const b = book({}, { rows: 12, cols: 6 });
    const sheet = b.sheets[0]!;
    const fx = compileFormula('=B1>A1', b.wb.ctxFor(sheet.id));
    if (!fx.ok) throw new Error('compile');
    const s1 = apply(
      sheet,
      setValidationRule(sheet.layout, g(0, 1, 9, 1), { is: 'formula', fx: fx.formula }, rand)!
        .write,
    );
    const s2 = apply(s1, setValidationRule(s1.layout, g(0, 1, 2, 1), { is: 'check' }, rand)!.write);
    const left = s2.layout.rules!.find((x) => x.is === 'formula')!;
    expect(posRangeOf(s2.layout, left)).toEqual(g(3, 1, 9, 1));
    expect(left.fx!.r.map((x) => [x.r1, x.c1])).toEqual([
      [s2.layout.rows[3], s2.layout.cols[1]],
      [s2.layout.rows[3], s2.layout.cols[0]],
    ]);
  });
  it('moves a custom formula when the rule loses its top row', () => {
    const b = book({}, { rows: 12, cols: 6 });
    const sheet = b.sheets[0]!;
    const fx = compileFormula('=B1>A1', b.wb.ctxFor(sheet.id));
    if (!fx.ok) throw new Error('compile');
    const s1 = apply(
      sheet,
      setValidationRule(sheet.layout, g(0, 1, 9, 1), { is: 'formula', fx: fx.formula }, rand)!
        .write,
    );
    const s2 = apply(s1, {
      kind: 'layout',
      changes: [{ k: 'deleteRows', ids: [s1.layout.rows[0]!] }],
    });
    const rule = s2.layout.rules![0]!;
    expect(rule.r1).toBe(s1.layout.rows[1]);
    expect(rule.fx!.r.map((x) => x.r1)).toEqual([s1.layout.rows[1], s1.layout.rows[1]]);
  });
});

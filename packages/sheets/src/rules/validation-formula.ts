// The checks only a workbook can make (data-validation.md "Where values are checked"): a Dropdown from a Range's
// options and a Custom Formula Is rule's answer, both formulas' results. The editor makes them; the api, which keeps
// no workbook, lets those rules through.
import type { Workbook } from '../engine/workbook';
import { formulaAnswerMet, movedFormula } from './moved-formula';
import { rangeOptions, type FormulaAllows, type RuleCtx } from './validation';

// Whether a Custom Formula Is rule allows `v` at (r, c): its formula, moved there, worked out with the cell read as
// `v` (and every formula between them afresh), or on the cell as it is when `v` is undefined.
export function validationFormulaAllows(wb: Workbook, sheetId: string): FormulaAllows {
  return (rule, r, c, v) => {
    const moved = movedFormula(wb, sheetId, rule, r, c, 'validation');
    if (!moved) return true;
    const answer =
      v === undefined
        ? wb.evaluateAt(sheetId, r, c, moved)
        : wb.evaluateWith(sheetId, r, c, moved, [{ cell: { sheetId, r, c }, value: v }]);
    return formulaAnswerMet(answer);
  };
}

// The workbook's checks for a sheet's rules, spread into a RuleCtx or a WriteCheck.
export function workbookRuleChecks(
  wb: Workbook,
  sheetId: string,
): Required<Pick<RuleCtx, 'rangeValues' | 'formulaAllows'>> {
  return {
    rangeValues: (rule) => rangeOptions(wb, sheetId, rule),
    formulaAllows: validationFormulaAllows(wb, sheetId),
  };
}

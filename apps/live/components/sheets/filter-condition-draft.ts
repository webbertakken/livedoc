// A filter column's Filter by Condition as it is being chosen (docs/specs/029-sheets/data-tools.md "Filters, filter
// views and slicers"): Google's list of conditions, a date's period or exact date, two values for a range, and Custom
// Formula Is as typed; and the condition it stores.
import {
  CONDITION_OPS,
  DATE_PERIODS,
  type DatePeriod,
  type FilterCondition,
  type StoredFormula,
} from '@livedoc/sheets';

export type ConditionChoice = NonNullable<FilterCondition['op']>;

export const CONDITION_CHOICES: readonly ConditionChoice[] = [...CONDITION_OPS, 'formula'];

export const CONDITION_LABELS: Record<ConditionChoice, string> = {
  empty: 'Is empty',
  notEmpty: 'Is not empty',
  contains: 'Text contains',
  notContains: 'Text does not contain',
  startsWith: 'Text starts with',
  endsWith: 'Text ends with',
  exactly: 'Text is exactly',
  dateBefore: 'Date is before',
  dateAfter: 'Date is after',
  dateOn: 'Date is',
  gt: 'Greater than',
  gte: 'Greater than or equal to',
  lt: 'Less than',
  lte: 'Less than or equal to',
  between: 'Is between',
  notBetween: 'Is not between',
  eq: 'Is equal to',
  neq: 'Is not equal to',
  formula: 'Custom formula is',
};

export const PERIOD_LABELS: Record<DatePeriod, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  yesterday: 'Yesterday',
  pastWeek: 'In the past week',
  pastMonth: 'In the past month',
  pastYear: 'In the past year',
};

export const PERIOD_CHOICES: readonly DatePeriod[] = DATE_PERIODS;

export const FORMULA_UNREADABLE = "That formula can't be read";

export type ConditionDraft = {
  op: ConditionChoice | '';
  a: string;
  b: string;
  // A date condition's period; '' for an exact date.
  d: DatePeriod | '';
  // Custom Formula Is, as the person types it.
  fx: string;
};

export const isDateOp = (op: ConditionDraft['op']) =>
  op === 'dateOn' || op === 'dateBefore' || op === 'dateAfter';
export const takesTwo = (op: ConditionDraft['op']) => op === 'between' || op === 'notBetween';
/** Whether the draft asks for a value: not for empty or not empty, a date's period or a formula. */
export const takesValue = (draft: ConditionDraft) =>
  draft.op !== '' &&
  draft.op !== 'empty' &&
  draft.op !== 'notEmpty' &&
  draft.op !== 'formula' &&
  !(isDateOp(draft.op) && draft.d !== '');

export function conditionDraftOf(
  cond: FilterCondition | undefined,
  formulaText: (fx: StoredFormula) => string,
): ConditionDraft {
  return {
    op: cond?.op ?? '',
    a: cond?.a ?? '',
    b: cond?.b ?? '',
    d: cond?.d ?? '',
    fx: cond?.fx ? formulaText(cond.fx) : '=',
  };
}

/** The condition's part of what the filter stores, or why it cannot be; `compile` reads a typed formula. */
export function conditionOfDraft(
  draft: ConditionDraft,
  compile: (text: string) => StoredFormula | null,
): { ok: true; part: Partial<FilterCondition> } | { ok: false; why: string } {
  const { op, a, b, d } = draft;
  if (op === '') return { ok: true, part: {} };
  if (op === 'formula') {
    const text = draft.fx.trim();
    const fx =
      text === '' || text === '=' ? null : compile(text.startsWith('=') ? text : `=${text}`);
    return fx ? { ok: true, part: { op, fx } } : { ok: false, why: FORMULA_UNREADABLE };
  }
  if (isDateOp(op) && d !== '') return { ok: true, part: { op, d } };
  // A value typed for an earlier condition goes with it, as it always has.
  return { ok: true, part: { op, ...(a ? { a } : {}), ...(takesTwo(op) && b ? { b } : {}) } };
}

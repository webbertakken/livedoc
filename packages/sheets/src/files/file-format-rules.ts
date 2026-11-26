// Format rules as a file holds them (docs/specs/029-sheets/standard-mapping.md "Format rules in the file", D215): each
// rule's rectangles by position (its anchor first), its condition's values as numbers or text, a custom formula in
// Google's syntax written for the anchor's top-left cell. Date conditions travel as the formula testing the same day,
// Text Is Exactly as Is Equal To; each format's reader and writer maps this to its own XML.
import { formatA1, type GridRange } from '../address';
import { dateFromSerial } from '../dates';
import { conditionNumber } from '../filter';
import { compileFormula, renderFormula, type SheetsCtx } from '../formula/stored';
import { makeAxisIds, type Rand } from '../ids';
import { idRangeOf } from '../layout';
import { isFormatRule } from '../rules/rule-shape';
import { rulePositions } from '../rules/rule-ranges';
import type { ConditionOp, FormatRule, FormatStyle, ScalePoint, SheetLayout } from '../sheet';
import { shiftFormulaText } from './formula-text-shift';
import type { FileLoss } from './workbook-file';

/** One format rule in a file: `formula` (Google's syntax) is written for the first range's top-left cell. */
export type FileFormatRule = {
  ranges: GridRange[];
  is: 'when' | 'scale';
  op?: ConditionOp | 'formula';
  a?: string | number;
  b?: string | number;
  formula?: string;
  style?: FormatStyle;
  min?: ScalePoint;
  mid?: ScalePoint;
  max?: ScalePoint;
};

const DATE_TESTS: Partial<Record<ConditionOp, string>> = {
  dateBefore: '<',
  dateAfter: '>',
  dateOn: '=',
};
const COMPARED: ReadonlySet<string> = new Set([
  'gt',
  'gte',
  'lt',
  'lte',
  'eq',
  'neq',
  'between',
  'notBetween',
]);

// A date condition as the formula testing the same day; one whose date cannot be read meets nothing, as it draws.
function dateFormula(op: ConditionOp, a: string | undefined, anchor: string, locale: string) {
  const n = conditionNumber(a, locale);
  if (n === null) return '=FALSE';
  const d = dateFromSerial(Math.floor(n));
  return `=AND(ISNUMBER(${anchor}),INT(${anchor})${DATE_TESTS[op]}DATE(${d.y},${d.m},${d.d}))`;
}

function fileRuleOf(
  layout: SheetLayout,
  rule: FormatRule,
  ctx: SheetsCtx,
  locale: string,
): FileFormatRule | null {
  const ranges = rulePositions(layout, rule);
  if (!ranges.length) return null;
  if (rule.is === 'scale')
    return {
      ranges,
      is: 'scale',
      min: rule.min!,
      ...(rule.mid ? { mid: rule.mid } : {}),
      max: rule.max!,
    };
  const base = { ranges, is: 'when' as const, style: rule.style! };
  const op = rule.op!;
  if (op === 'formula') return { ...base, op, formula: renderFormula(rule.fx!, ctx) };
  if (DATE_TESTS[op]) {
    const anchor = formatA1(ranges[0]!.r1, ranges[0]!.c1);
    return { ...base, op: 'formula', formula: dateFormula(op, rule.a, anchor, locale) };
  }
  if (op === 'exactly') return { ...base, op: 'eq', a: rule.a! };
  const operand = (key: 'a' | 'b') => {
    const x = rule[key];
    return x === undefined ? {} : { [key]: conditionNumber(x, locale) ?? x };
  };
  if (COMPARED.has(op)) return { ...base, op, ...operand('a'), ...operand('b') };
  return { ...base, op, ...(rule.a === undefined ? {} : { a: rule.a }) };
}

/** A sheet's format rules as a file holds them, in list order; none when it has none on the grid. */
export function fileFormatRulesOf(
  layout: SheetLayout,
  ctx: SheetsCtx,
  locale: string,
): FileFormatRule[] | undefined {
  const out = (layout.formatRules ?? []).flatMap((x) => fileRuleOf(layout, x, ctx, locale) ?? []);
  return out.length ? out : undefined;
}

// A range cut to the grid; null when it starts past it.
function onGrid(g: GridRange, layout: SheetLayout): GridRange | null {
  const rows = layout.rows.length;
  const cols = layout.cols.length;
  if (g.r1 >= rows || g.c1 >= cols) return null;
  return { ...g, r2: Math.min(g.r2, rows - 1), c2: Math.min(g.c2, cols - 1) };
}

/**
 * A file's format rules made on a sheet's grid, in order: ranges cut to the grid, a formula compiled for the anchor
 * (moved when the first range is off the grid), each checked as a write is; a rule that cannot be made is named at
 * its anchor (`format_rule_unread`).
 */
export function formatRulesFromFile(
  rules: readonly FileFormatRule[] | undefined,
  layout: SheetLayout,
  ctx: SheetsCtx,
  sheet: string,
  rand: Rand,
  losses: FileLoss[],
): FormatRule[] | undefined {
  const out: FormatRule[] = [];
  const taken = new Set<string>();
  for (const x of rules ?? []) {
    const at = x.ranges[0]!;
    const unread = () => losses.push({ k: 'format_rule_unread', sheet, r: at.r1, c: at.c1 });
    const kept = x.ranges.flatMap((g) => onGrid(g, layout) ?? []);
    const [first, ...rest] = kept.map((g) => idRangeOf(layout, g.r1, g.c1, g.r2, g.c2)!);
    if (!first) {
      unread();
      continue;
    }
    const [id] = makeAxisIds(1, rand, taken);
    taken.add(id!);
    const made: FormatRule = {
      id: id!,
      ...first,
      ...(rest.length ? { also: rest } : {}),
      is: x.is,
    };
    if (x.is === 'scale')
      Object.assign(made, { min: x.min, max: x.max }, x.mid ? { mid: x.mid } : {});
    else {
      Object.assign(made, { op: x.op, style: x.style });
      if (x.a !== undefined) made.a = String(x.a);
      if (x.b !== undefined) made.b = String(x.b);
      if (x.formula !== undefined) {
        const moved = shiftFormulaText(x.formula, kept[0]!.r1 - at.r1, kept[0]!.c1 - at.c1);
        const compiled = compileFormula(moved, ctx);
        if (compiled.ok) made.fx = compiled.formula;
      }
    }
    if (isFormatRule(made, made.id, layout, () => true)) out.push(made);
    else unread();
  }
  return out.length ? out : undefined;
}

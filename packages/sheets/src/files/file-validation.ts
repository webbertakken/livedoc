// Validation rules as a file holds them (docs/specs/029-sheets/standard-mapping.md "Validation in the file", D289):
// each rule's settings with its rectangles by position, a range source as text (`'My Lists'!A1:A3`), a custom
// formula in Google's syntax written for the first rectangle's top-left cell. Each format's reader and writer maps
// this to its standard rule and LiveDoc's rule beside it (validation-standard.ts).
import type { GridRange } from '../address';
import { compileFormula, renderFormula, type SheetsCtx } from '../formula/stored';
import { makeAxisIds, type Rand } from '../ids';
import { idRangeOf, posRangeOf } from '../layout';
import { VALIDATION_RULES_MAX } from '../limits';
import { isValidationRule } from '../rules/rule-shape';
import { sourceFromText, sourceSheetOf, sourceText } from '../rules/rule-source';
import type { SheetLayout, ValidationRule } from '../sheet';
import { shiftFormulaText } from './formula-text-shift';
import type { FileLoss } from './workbook-file';

/** A rule's settings as a file holds them: the model's, its source as text and its formula in Google's syntax. */
export type FileValidationSettings = Omit<
  ValidationRule,
  'id' | 'r1' | 'c1' | 'r2' | 'c2' | 'src' | 'fx'
> & { src?: string; fx?: string };

/** One validation rule in a file: its settings over one rectangle or more. */
export type FileValidationRule = FileValidationSettings & { ranges: GridRange[] };

/** A sheet's validation rules as a file holds them, in list order; none when it has none on the grid. */
export function fileValidationRulesOf(
  layout: SheetLayout,
  ctx: SheetsCtx,
): FileValidationRule[] | undefined {
  const out: FileValidationRule[] = [];
  for (const rule of layout.rules ?? []) {
    const at = posRangeOf(layout, rule);
    if (!at) continue;
    const { id: _id, r1: _r1, c1: _c1, r2: _r2, c2: _c2, src, fx, ...settings } = rule;
    const file: FileValidationRule = { ...settings, ranges: [at] };
    // A source whose sheet or cells are gone is written without it, so the read names the rule.
    const text = src ? sourceText(sourceSheetOf(ctx, src), src) : '';
    if (text) file.src = text;
    if (fx) file.fx = renderFormula(fx, ctx);
    out.push(file);
  }
  return out.length ? out : undefined;
}

// A range cut to the grid; null when it starts past it.
function onGrid(g: GridRange, layout: SheetLayout): GridRange | null {
  if (g.r1 >= layout.rows.length || g.c1 >= layout.cols.length) return null;
  return {
    ...g,
    r2: Math.min(g.r2, layout.rows.length - 1),
    c2: Math.min(g.c2, layout.cols.length - 1),
  };
}

const overlaps = (a: GridRange, b: GridRange) =>
  a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;

/**
 * A file's validation rules made on a sheet's grid, one rule a rectangle, in order: each cut to the grid, its formula
 * moved to its own top-left cell, its source found by title, checked as a write is. A rectangle that cannot be made
 * (off the grid, over another rule's cells, past VALIDATION_RULES_MAX, or not a rule) is named at its top-left cell
 * (`validation_rule_unread`).
 */
export function validationRulesFromFile(
  rules: readonly FileValidationRule[] | undefined,
  layout: SheetLayout,
  ctx: SheetsCtx,
  sheet: string,
  rand: Rand,
  losses: FileLoss[],
): ValidationRule[] | undefined {
  const out: ValidationRule[] = [];
  const made: GridRange[] = [];
  const taken = new Set<string>();
  for (const x of rules ?? []) {
    const { ranges, src, fx, ...settings } = x;
    const anchor = ranges[0]!;
    for (const range of ranges) {
      const unread = () =>
        losses.push({ k: 'validation_rule_unread', sheet, r: range.r1, c: range.c1 });
      const g = onGrid(range, layout);
      if (!g || out.length >= VALIDATION_RULES_MAX || made.some((m) => overlaps(m, g))) {
        unread();
        continue;
      }
      const [id] = makeAxisIds(1, rand, taken);
      const rule: ValidationRule = {
        id: id!,
        ...idRangeOf(layout, g.r1, g.c1, g.r2, g.c2)!,
        ...settings,
      };
      if (src !== undefined) {
        const source = sourceFromText(ctx, src);
        if (source) rule.src = source;
      }
      if (fx !== undefined) {
        const compiled = compileFormula(
          shiftFormulaText(fx, g.r1 - anchor.r1, g.c1 - anchor.c1),
          ctx,
        );
        if (compiled.ok) rule.fx = compiled.formula;
      }
      if (!isValidationRule(rule, rule.id, layout, () => true)) {
        unread();
        continue;
      }
      taken.add(rule.id);
      made.push(g);
      out.push(rule);
    }
  }
  return out.length ? out : undefined;
}

/** What another app's standard rule leaves out of a rule, in the order the conversion dialog names them. */
export const SIMPLIFIED_FEATURES = ['colours', 'chips', 'multi', 'checkboxes'] as const;
export type SimplifiedFeature = (typeof SIMPLIFIED_FEATURES)[number];

// What another app loses of one rule: an option's colour, the Chip and Arrow display, multiple selections, a checkbox.
function simplifiedOf(rule: FileValidationRule): SimplifiedFeature[] {
  const dropdown = rule.is === 'list' || rule.is === 'range';
  const has: Record<SimplifiedFeature, boolean> = {
    colours: (rule.opts ?? []).some((o) => o.c !== undefined),
    chips: dropdown && rule.show !== 'plain',
    multi: rule.multi === true,
    checkboxes: rule.is === 'check',
  };
  return SIMPLIFIED_FEATURES.filter((f) => has[f]);
}

/** The rules another app holds more simply (standard-mapping.md "Validation in the file"), and what each loses. */
export function simplifiedElsewhere(rules: readonly FileValidationRule[]): {
  count: number;
  features: SimplifiedFeature[];
} {
  const lost = rules.map(simplifiedOf).filter((f) => f.length > 0);
  const all = new Set(lost.flat());
  return { count: lost.length, features: SIMPLIFIED_FEATURES.filter((f) => all.has(f)) };
}

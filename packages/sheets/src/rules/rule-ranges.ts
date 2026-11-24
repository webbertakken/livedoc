// A format rule's range of several rectangles (docs/specs/029-sheets/conditional-formatting.md "Rules", D214): the
// anchor (the rule's own corners) then the rest, as rectangles, as positions, and as the text a person types.
import { formatRange, parseRangeText, type GridRange } from '../address';
import { posRangeOf } from '../layout';
import { FORMAT_RULE_RANGES_MAX } from '../limits';
import type { IdRange, SheetLayout } from '../sheet';

/** A rule's rectangles by id: its anchor first, then `also`. */
export function ruleRectangles(rule: IdRange & { also?: readonly IdRange[] }): IdRange[] {
  const { r1, c1, r2, c2 } = rule;
  return [{ r1, c1, r2, c2 }, ...(rule.also ?? [])];
}

/** A rule's rectangles as positions, those with a corner gone left out. */
export function rulePositions(
  layout: SheetLayout,
  rule: IdRange & { also?: readonly IdRange[] },
): GridRange[] {
  return ruleRectangles(rule).flatMap((x) => posRangeOf(layout, x) ?? []);
}

/** The range as a person reads it: "A1:A10,C1:C10". */
export function ruleRangeText(
  layout: SheetLayout,
  rule: IdRange & { also?: readonly IdRange[] },
): string {
  return rulePositions(layout, rule).map(formatRange).join(',');
}

/** A typed range of one or more rectangles, with commas; null when any is not one, or there are too many. */
export function parseRuleRangeText(text: string): GridRange[] | null {
  const parts = text.split(',');
  if (parts.length > FORMAT_RULE_RANGES_MAX) return null;
  const out: GridRange[] = [];
  for (const part of parts) {
    const g = parseRangeText(part);
    if (!g) return null;
    out.push(g);
  }
  return out;
}

/** Whether any of a rule's rectangles overlaps `range`. */
export function ruleTouches(
  layout: SheetLayout,
  rule: IdRange & { also?: readonly IdRange[] },
  range: GridRange,
): boolean {
  return rulePositions(layout, rule).some(
    (p) => p.r1 <= range.r2 && range.r1 <= p.r2 && p.c1 <= range.c2 && range.c1 <= p.c2,
  );
}

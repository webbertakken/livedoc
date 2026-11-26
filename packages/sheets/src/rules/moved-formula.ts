// A rule's custom formula moved to a cell (conditional-formatting.md and data-validation.md "Custom Formula Is"):
// written for its range's top-left cell, its references moved to each cell as a copied formula's are. Moved once
// per cell and kept until the workbook's next recalculation, shared by format and validation rules.
import { posRangeOf } from '../layout';
import { shiftForCopy } from '../formula/stored';
import type { Value } from '../formula/values';
import type { IdRange, StoredFormula } from '../sheet';
import type { Workbook } from '../engine/workbook';

// The most custom formulas kept moved to their cells per recalculation, so a long scroll cannot grow it unbounded.
const MOVED_KEEP_MAX = 20_000;

type Moved = { version: number; map: Map<string, StoredFormula> };
const MOVED = new WeakMap<Workbook, Moved>();

// A rule with a custom formula: its id, its range's corners and the formula written for the top-left cell.
export type FormulaRule = IdRange & { id: string; fx?: StoredFormula };

// The rule's formula as it reads at (r, c), or null when the rule has none or its range is gone. `kind` keeps a
// format rule's and a validation rule's apart.
export function movedFormula(
  wb: Workbook,
  sheetId: string,
  rule: FormulaRule,
  r: number,
  c: number,
  kind: 'format' | 'validation',
): StoredFormula | null {
  const sheet = wb.sheet(sheetId);
  const p = sheet && rule.fx ? posRangeOf(sheet.layout, rule) : null;
  if (!sheet || !p || !rule.fx) return null;
  let cache = MOVED.get(wb);
  if (!cache || cache.version !== wb.version) {
    cache = { version: wb.version, map: new Map() };
    MOVED.set(wb, cache);
  }
  const dr = r - p.r1;
  const dc = c - p.c1;
  const key = `${kind}|${sheetId}|${rule.id}|${dr}|${dc}`;
  let moved = cache.map.get(key);
  if (!moved) {
    moved = dr === 0 && dc === 0 ? rule.fx : shiftForCopy(rule.fx, dr, dc, wb.ctxFor(sheetId));
    if (cache.map.size >= MOVED_KEEP_MAX) cache.map.clear();
    cache.map.set(key, moved);
  }
  return moved;
}

// Whether a custom formula's answer meets its rule: TRUE, or a number other than 0.
export function formulaAnswerMet(v: Value): boolean {
  return v === true || (typeof v === 'number' && v !== 0);
}

// Typing in a dropdown cell (docs/specs/029-sheets/data-validation.md "Using a dropdown"): the options matching what
// is typed, those starting with it first, then those holding it, case aside; at most DROPDOWN_ASSIST_MAX. With Allow
// Multiple Selections, the part after the last comma is matched, and each option's value keeps the parts before it.
import { hasValidation, rangeOptions, validationRuleAt, type Workbook } from '@livedoc/sheets';

// An option shown under the editor, and the cell's text it saves.
export type DropdownMatch = { label: string; value: string };

const DROPDOWN_ASSIST_MAX = 8;

export function dropdownMatches(
  wb: Workbook,
  sheetId: string,
  at: { r: number; c: number },
  draft: string,
): DropdownMatch[] | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet || draft.startsWith('=') || !hasValidation(sheet.layout)) return null;
  const rule = validationRuleAt(sheet.layout, at.r, at.c);
  if (!rule || (rule.is !== 'list' && rule.is !== 'range')) return null;
  const comma = rule.multi ? draft.lastIndexOf(',') : -1;
  const before = comma < 0 ? '' : `${draft.slice(0, comma).trim()}, `;
  const q = draft
    .slice(comma + 1)
    .trim()
    .toLowerCase();
  if (!q) return null;
  const all =
    rule.is === 'list'
      ? (rule.opts ?? []).map((o) => o.v)
      : rangeOptions(wb, sheetId, rule).map((o) => o.shown);
  const starts = all.filter((o) => o.toLowerCase().startsWith(q));
  const holds = all.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
  const found = [...starts, ...holds].slice(0, DROPDOWN_ASSIST_MAX);
  // Typed in full already: nothing to offer.
  if (found.length === 1 && found[0]!.toLowerCase() === q) return null;
  return found.length ? found.map((o) => ({ label: o, value: `${before}${o}` })) : null;
}

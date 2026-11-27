// Grouping a pivot table's items from the grid's context menu (docs/specs/029-sheets/pivot-tables.md "Grouping in the
// grid", D621): which of Create Pivot Date Group, Create Pivot Group Rule, Create Pivot Group and Ungroup Pivot Items
// the active cell and the selection offer, and what the Pivot Group Rule dialog's fields read as.
import {
  PIVOT_DATE_RULES,
  type PivotDateRule,
  type PivotGrouping,
  type PivotItemPlace,
  type PivotItemRef,
  type Selection,
  type Sheet,
  type SheetPivot,
  type Workbook,
} from '@livedoc/sheets';

/** Each date rule's entry in Create Pivot Date Group, in Title Case (D125). */
export const PIVOT_DATE_RULE_LABELS: Record<PivotDateRule, string> = {
  second: 'Second',
  minute: 'Minute',
  hour: 'Hour',
  hourMinute: 'Hour-Minute',
  hourMinuteAmPm: 'Hour-Minute (12 Hour)',
  dayOfWeek: 'Day of the Week',
  dayOfYear: 'Day of the Year',
  dayOfMonth: 'Day of the Month',
  dayMonth: 'Day-Month',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  yearQuarter: 'Year-Quarter',
  yearMonth: 'Year-Month',
  yearMonthDay: 'Year-Month-Day',
};

/** A date rule's menu item id. */
export const pivotDateGroupId = (rule: PivotDateRule) => `pivot-date-group-${rule}`;
export const PIVOT_DATE_GROUP_IDS = PIVOT_DATE_RULES.map(pivotDateGroupId);

// The most cells a selection is read through for Create Pivot Group: past it, the menu offers none.
export const PIVOT_GROUP_PICK_MAX = 1000;

/** What the context menu offers on an item cell of a pivot table's output. */
export type PivotGroupingMenu = {
  pivot: SheetPivot;
  item: PivotItemPlace;
  dateGroup: boolean;
  groupRule: boolean;
  // The selection's items, two or more of the active cell's group, for Create Pivot Group; null when it offers none.
  picked: PivotItemRef[] | null;
  ungroup: boolean;
};

const sameGroup = (a: PivotItemPlace & { pivotId: string }, b: typeof a) =>
  a.pivotId === b.pivotId && a.axis === b.axis && a.depth === b.depth;

// Every cell of the selection an item of the active cell's group, two or more items told apart; else null.
function pickedItems(
  wb: Workbook,
  sheetId: string,
  selection: Selection,
  active: PivotItemPlace & { pivotId: string },
): PivotItemRef[] | null {
  let count = 0;
  for (const g of selection.ranges) count += (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1);
  if (count < 2 || count > PIVOT_GROUP_PICK_MAX) return null;
  const byKey = new Map<string, PivotItemRef>();
  for (const g of selection.ranges)
    for (let r = g.r1; r <= g.r2; r++)
      for (let c = g.c1; c <= g.c2; c++) {
        const item = wb.pivotItemAt(sheetId, r, c);
        if (!item || !sameGroup(item, active)) return null;
        const { label, shown, made } = item;
        byKey.set(`${made ?? ''}:${JSON.stringify(label)}:${shown ?? ''}`, {
          label,
          ...(shown !== undefined ? { shown } : {}),
          ...(made ? { made } : {}),
        });
      }
  return byKey.size >= 2 ? [...byKey.values()] : null;
}

/** What the context menu offers at the active cell, or null when it is no item cell of a pivot table's output. */
export function pivotGroupingMenu(
  wb: Workbook,
  sheet: Sheet,
  selection: Selection,
): PivotGroupingMenu | null {
  const { r, c } = selection.active;
  const item = wb.pivotItemAt(sheet.id, r, c);
  if (!item) return null;
  const pivot = (sheet.layout.objects ?? []).find(
    (x): x is SheetPivot => x.kind === 'pivot' && x.id === item.pivotId,
  );
  if (!pivot) return null;
  const grouping = pivot[item.axis]?.[item.depth]?.grouping;
  const number = typeof item.label === 'number' && !item.made;
  return {
    pivot,
    item,
    dateGroup: number && item.date,
    groupRule: number && !item.date,
    picked: grouping && grouping.k !== 'custom' ? null : pickedItems(wb, sheet.id, selection, item),
    ungroup: item.made !== undefined,
  };
}

/** The Pivot Group Rule dialog's fields as they stand. */
export type PivotGroupRuleFields = { min: string; max: string; size: string };

export type PivotGroupRuleRead =
  | { ok: true; grouping: Extract<PivotGrouping, { k: 'interval' }> }
  | { ok: false; field: keyof PivotGroupRuleFields; why: string };

// A field's number, undefined when empty, NaN when it does not read.
const numberOf = (text: string) => (text.trim() === '' ? undefined : Number(text.trim()));

/** What OK does with the fields: an interval grouping, or the field that does not read and why. */
export function readPivotGroupRule(fields: PivotGroupRuleFields): PivotGroupRuleRead {
  const min = numberOf(fields.min);
  const max = numberOf(fields.max);
  const size = numberOf(fields.size);
  if (min !== undefined && !Number.isFinite(min))
    return { ok: false, field: 'min', why: 'Enter a number' };
  if (max !== undefined && !Number.isFinite(max))
    return { ok: false, field: 'max', why: 'Enter a number' };
  if (min !== undefined && max !== undefined && min >= max)
    return { ok: false, field: 'max', why: 'The minimum must be below the maximum' };
  if (size === undefined || !Number.isFinite(size) || size <= 0)
    return { ok: false, field: 'size', why: 'Enter a number above 0' };
  return {
    ok: true,
    grouping: {
      k: 'interval',
      size,
      ...(min !== undefined ? { start: min } : {}),
      ...(max !== undefined ? { end: max } : {}),
    },
  };
}

/** The dialog's fields as it opens: the group's lowest and highest numbers, the size empty. */
export function pivotGroupRuleStart(item: PivotItemPlace): PivotGroupRuleFields {
  return {
    min: item.numbers ? String(item.numbers.min) : '',
    max: item.numbers && item.numbers.max > item.numbers.min ? String(item.numbers.max) : '',
    size: '',
  };
}

// A group by view's aggregations as drawn (docs/specs/029-sheets/data-tools.md "Group by view", D501): each column's
// for one group, its name and its value in the column's number format (its first kept row's), a percent as a percent.
import {
  cellKey,
  displayValue,
  GROUP_AGGREGATE_LABELS,
  groupAggregate,
  scalarOf,
  type DrawnGroup,
  type GroupAggregate,
  type Sheet,
  type Workbook,
} from '@livedoc/sheets';

const COUNTED = new Set<GroupAggregate>(['count', 'empty', 'filled', 'unique']);
const SHARES = new Set<GroupAggregate>(['pctEmpty', 'pctFilled', 'pctUnique']);

/** One group's aggregation of the column at `c`, as its header shows it: `Sum 12`; null when it has none to show. */
export function groupAggregateText(
  at: { sheet: Sheet; workbook: Workbook; locale: string },
  group: DrawnGroup,
  c: number,
  kind: GroupAggregate,
): string | null {
  const { sheet, workbook, locale } = at;
  const values = group.kept.map((r) => scalarOf(workbook.value(sheet.id, r, c)));
  const value = groupAggregate(kind, values);
  if (value === null) return null;
  const label = GROUP_AGGREGATE_LABELS[kind];
  if (COUNTED.has(kind)) return `${label} ${displayValue(value, undefined, locale).text}`;
  if (SHARES.has(kind))
    return `${label} ${displayValue(value, { nf: 'percent', dp: 0 }, locale).text}`;
  const first = group.kept[0]!;
  const own = sheet.cells.get(cellKey(sheet.layout.rows[first]!, sheet.layout.cols[c]!))?.format;
  const format = workbook.shownFormat(sheet.id, first, c, own);
  return `${label} ${displayValue(value, format, locale).text}`;
}

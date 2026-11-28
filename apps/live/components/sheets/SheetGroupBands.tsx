'use client';

// A group by view's header rows (docs/specs/029-sheets/data-tools.md "Group by view", D497): a band before each group
// across its table's columns, with its opener, the value as the group's first row shows it and the count of rows the
// view keeps. The bands are no rows of the sheet: pressing one selects nothing, and its opener (a button reached with
// Tab, Enter or Space on it) collapses or expands the group for this person alone.
import { liveGroup, type DrawnGroup } from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { useSheetController } from './sheet-controller';
import { cellSpokenValue } from './sheet-cell-speech';
import { GROUP_HEADER_PX } from './sheet-geometry';

/** A blank group's name (D497). */
export const BLANK_GROUP = '(Blank)';

/** The opener's name: what pressing it does, the group and its rows. */
export const groupOpenerLabel = (label: string, count: number, collapsed: boolean): string =>
  `${collapsed ? 'Expand' : 'Collapse'} ${label}, ${count} ${count === 1 ? 'row' : 'rows'}`;

export function SheetGroupBands() {
  const c = useSheetController();
  const { open, collapsed, setCollapsed } = c.filterViews;
  const g = c.geometry;
  const live = open ? liveGroup(c.sheet.layout, open) : null;
  if (!live || !g.bands.length) return null;
  const { box, col } = live;
  const x0 = box.c1 < g.frozenCols ? g.cols[box.c1]! : g.cols[box.c1]! - c.scroll.left;
  const width = g.cols[box.c2 + 1]! - g.cols[box.c1]!;
  const labelOf = (group: DrawnGroup) =>
    group.blank
      ? BLANK_GROUP
      : cellSpokenValue(c.sheet, c.workbook, c.locale, group.first, col) || BLANK_GROUP;
  const toggle = (group: DrawnGroup) => {
    const next = new Set(collapsed);
    const shut = !next.delete(group.key);
    if (shut) next.add(group.key);
    setCollapsed(next);
    track('Spreadsheet', 'Toggled', 'GroupByViewGroup');
    debugLog('[sheet] group toggled', { collapsed: shut, rows: group.count });
  };
  return (
    // The bands scroll under the frozen rows, never over them.
    <div
      data-sheet-groups=""
      className="pointer-events-none absolute inset-x-0 bottom-0 overflow-clip"
      style={{ top: g.frozenHeight }}
    >
      {g.bands.map(({ group, top }) => {
        const y = top - c.scroll.top - g.frozenHeight;
        if (y + GROUP_HEADER_PX < 0 || y > c.view.height) return null;
        const label = labelOf(group);
        const shut = collapsed.has(group.key);
        return (
          <div
            key={group.key}
            data-group-band={group.key}
            className="pointer-events-auto absolute flex items-center gap-2 border-b px-1 text-body"
            style={{
              left: x0,
              top: y,
              width,
              height: GROUP_HEADER_PX,
              background: c.palette.column,
              borderColor: c.palette.border,
              color: c.palette.text,
            }}
            // A band is no cell: pressing it selects nothing.
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-expanded={!shut}
              aria-label={groupOpenerLabel(label, group.count, shut)}
              className="flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-black/10 focus-visible:outline focus-visible:outline-2 dark:hover:bg-white/15"
              style={{ outlineColor: c.palette.focus }}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={() => toggle(group)}
            >
              <span aria-hidden>{shut ? '▸' : '▾'}</span>
            </button>
            <span className="min-w-0 truncate font-medium">{label}</span>
            <span
              aria-hidden
              className="shrink-0 rounded-full px-2 text-supporting font-normal"
              style={{ background: c.palette.surface, color: c.palette.muted }}
            >
              {group.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

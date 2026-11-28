'use client';

// A group by view's header rows (docs/specs/029-sheets/data-tools.md "Group by view", D497, D501, D502): a band before
// each group across its table's columns, its opener and the value as the group's first row shows it in the first
// column's part, and under each column its aggregation with a ▾ choosing it for every group. The bands are no rows of
// the sheet: pressing one selects nothing, and its opener (a button reached with Tab, Enter or Space on it) collapses
// or expands the group for this person alone.
import { useState } from 'react';
import {
  cellText,
  GROUP_AGGREGATE_LABELS,
  GROUP_AGGREGATES,
  liveGroup,
  tableColumnNames,
  type DrawnGroup,
  type GroupAggregate,
} from '@livedoc/sheets';
import { ContextMenu, ContextMenuDivider } from '@/components/palette/ContextMenu';
import { MenuActionRow, MenuHeader } from '@/components/primitives/PortalMenu';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { Glyph } from './SheetCellMenu';
import { groupAggregateText } from './group-aggregates';
import { useSheetController } from './sheet-controller';
import { cellSpokenValue } from './sheet-cell-speech';
import { GROUP_HEADER_PX } from './sheet-geometry';

/** A blank group's name (D497). */
export const BLANK_GROUP = '(Blank)';

/** The opener's name: what pressing it does, the group and its rows. */
export const groupOpenerLabel = (label: string, count: number, collapsed: boolean): string =>
  `${collapsed ? 'Expand' : 'Collapse'} ${label}, ${count} ${count === 1 ? 'row' : 'rows'}`;

type Chooser = { colId: string; name: string; x: number; y: number };

export function SheetGroupBands() {
  const c = useSheetController();
  const { open, collapsed, setCollapsed, change } = c.filterViews;
  const [chooser, setChooser] = useState<Chooser | null>(null);
  const g = c.geometry;
  const live = open ? liveGroup(c.sheet.layout, open) : null;
  if (!open?.group || !live || !g.bands.length) return null;
  const group = open.group;
  const { box, col } = live;
  const aggs = group.aggs ?? {};
  const shown = !group.hide;
  const names = tableColumnNames(c.sheet.layout, live.table, (r, colId) =>
    cellText(c.sheet, r, colId),
  );
  const x0 = box.c1 < g.frozenCols ? g.cols[box.c1]! : g.cols[box.c1]! - c.scroll.left;
  const width = g.cols[box.c2 + 1]! - g.cols[box.c1]!;
  const columns = Array.from({ length: box.c2 - box.c1 + 1 }, (_, i) => box.c1 + i);
  const labelOf = (dg: DrawnGroup) =>
    dg.blank
      ? BLANK_GROUP
      : cellSpokenValue(c.sheet, c.workbook, c.locale, dg.first, col) || BLANK_GROUP;
  const toggle = (dg: DrawnGroup) => {
    const next = new Set(collapsed);
    const shut = !next.delete(dg.key);
    if (shut) next.add(dg.key);
    setCollapsed(next);
    track('Spreadsheet', 'Toggled', 'GroupByViewGroup');
    debugLog('[sheet] group toggled', { collapsed: shut, rows: dg.count });
  };
  const choose = (colId: string, kind: GroupAggregate | null) => {
    setChooser(null);
    const { [colId]: _was, ...rest } = aggs;
    const next = kind ? { ...rest, [colId]: kind } : rest;
    const { aggs: _aggs, ...bare } = group;
    change({ ...open, group: Object.keys(next).length ? { ...bare, aggs: next } : bare });
    track('Spreadsheet', 'Changed', 'GroupAggregation');
    debugLog('[sheet] group aggregation', { kind: kind ?? 'none' });
  };
  return (
    // The bands scroll under the frozen rows, never over them.
    <div
      data-sheet-groups=""
      className="pointer-events-none absolute inset-x-0 bottom-0 overflow-clip"
      style={{ top: g.frozenHeight }}
    >
      {g.bands.map(({ group: dg, top }, bandAt) => {
        const y = top - c.scroll.top - g.frozenHeight;
        if (y + GROUP_HEADER_PX < 0 || y > c.view.height) return null;
        const label = labelOf(dg);
        const shut = collapsed.has(dg.key);
        return (
          <div
            key={dg.key}
            data-group-band={dg.key}
            className="pointer-events-auto absolute border-b text-body"
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
            {columns.map((at, i) => {
              const colId = c.sheet.layout.cols[at]!;
              const w = g.cols[at + 1]! - g.cols[at]!;
              if (w <= 0) return null;
              const kind = aggs[colId];
              const text = shown && kind ? groupAggregateText(c, dg, at, kind) : null;
              const name = names[i] ?? colId;
              return (
                <div
                  key={colId}
                  data-group-part={colId}
                  className="absolute inset-y-0 flex items-center gap-1 px-1"
                  style={{ left: g.cols[at]! - g.cols[box.c1]!, width: w }}
                >
                  {i === 0 ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={!shut}
                        aria-label={groupOpenerLabel(label, dg.count, shut)}
                        className="flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-black/10 focus-visible:outline focus-visible:outline-2 dark:hover:bg-white/15"
                        style={{ outlineColor: c.palette.focus }}
                        onKeyDown={(e) => e.stopPropagation()}
                        onClick={() => toggle(dg)}
                      >
                        <span aria-hidden>{shut ? '▸' : '▾'}</span>
                      </button>
                      <span className="min-w-0 shrink truncate font-medium">{label}</span>
                    </>
                  ) : null}
                  <span className="flex-1" />
                  {text ? (
                    <span
                      // Squeezed before the group's value, which names the group; its whole text on hover.
                      title={text}
                      className="min-w-0 shrink-[100] truncate text-supporting"
                      style={{ color: c.palette.muted }}
                    >
                      {text}
                    </span>
                  ) : null}
                  {shown ? (
                    <button
                      type="button"
                      // One way in by Tab, the first band's; every band's opens the same column's list.
                      tabIndex={bandAt === 0 ? 0 : -1}
                      aria-haspopup="dialog"
                      aria-label={`${name} aggregation`}
                      className="flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-control opacity-60 hover:bg-black/10 hover:opacity-100 focus-visible:opacity-100 dark:hover:bg-white/15"
                      onKeyDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setChooser({ colId, name, x: r.left, y: r.bottom });
                      }}
                    >
                      <span aria-hidden>▾</span>
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}
      {chooser ? (
        <ContextMenu
          position={{ x: chooser.x, y: chooser.y }}
          label={`${chooser.name} aggregation`}
          onClose={() => setChooser(null)}
        >
          <MenuHeader title={chooser.name} />
          <MenuActionRow
            label="None"
            icon={aggs[chooser.colId] ? <span aria-hidden /> : <Glyph t="✓" />}
            checked={!aggs[chooser.colId]}
            onClick={() => choose(chooser.colId, null)}
          />
          <ContextMenuDivider />
          {GROUP_AGGREGATES.map((kind) => (
            <MenuActionRow
              key={kind}
              label={GROUP_AGGREGATE_LABELS[kind]}
              icon={aggs[chooser.colId] === kind ? <Glyph t="✓" /> : <span aria-hidden />}
              checked={aggs[chooser.colId] === kind}
              onClick={() => choose(chooser.colId, kind)}
            />
          ))}
        </ContextMenu>
      ) : null}
    </div>
  );
}

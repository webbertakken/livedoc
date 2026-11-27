'use client';

// Each table's chip over the grid and its table menu (docs/specs/029-sheets/data-tools.md "Tables"): the table's name
// above its header row's first cell (on it, when the header is the sheet's first row). Pressing it, or Enter or Space
// on it, opens the menu: Table Settings, Rename (the name in place on the chip), Select Table, Filter, Convert to Range
// and Delete Table, as Google's table menu. Each header cell holds its column's ▾ button, opening the column menu (also
// Ctrl+Alt+\ on a cell of the table); while the table's own filter is on (and no filter view is open) it is the
// column's filter button, as Google's, drawn as a funnel once the column is filtered (D481, D482). Everyone sees them;
// what changes the table is an Editor's, dimmed for others.
import { useContext, useEffect, useRef, useState } from 'react';
import {
  cellText,
  posRangeOf,
  tableAt,
  tableColumnNames,
  tableNameProblem,
  type SheetTable,
} from '@livedoc/sheets';
import { ContextMenu, ContextMenuDivider } from '@/components/palette/ContextMenu';
import { MenuActionRow, MenuHeader } from '@/components/primitives/PortalMenu';
import { debugLog } from '@/lib/debug-log';
import { Glyph } from '../SheetCellMenu';
import { FilterMenu } from '../FilterMenu';
import { FilterIcon } from '../sheet-icons';
import { useSheetController } from '../sheet-controller';
import { rectOf } from '../SheetSelectionLayer';
import { useSheetActions } from '../useSheetActions';
import { TableColumnMenuContext, TableSettingsContext } from './table-settings-context';
import { TableColumnMenu } from './TableColumnMenu';

const CHIP_HEIGHT = 20;
const COLUMN_BUTTON = 16;

type MenuAt = { tableId: string; x: number; y: number };
type ColumnMenuAt = MenuAt & { colId: string };

// Where a menu opens: under the button that opened it.
const below = (el: Element) => {
  const box = el.getBoundingClientRect();
  return { x: box.left, y: box.bottom };
};

export function SheetTablesLayer() {
  const c = useSheetController();
  const actions = useSheetActions();
  const open = useContext(TableSettingsContext);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [columnMenu, setColumnMenu] = useState<ColumnMenuAt | null>(null);
  const [filterMenu, setFilterMenu] = useState<ColumnMenuAt | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const openerRef = useContext(TableColumnMenuContext);
  // Ctrl+Alt+\: the active cell's column's menu, under its header's button.
  useEffect(() => {
    if (!openerRef) return;
    openerRef.current = () => {
      const { active } = c.selectionNow();
      const t = tableAt(c.sheet.layout, active.r, active.c);
      const colId = c.sheet.layout.cols[active.c];
      const button =
        t && colId ? root.current?.querySelector(`[data-table-column="${t.id}:${colId}"]`) : null;
      if (!t || !colId || !button) return;
      setColumnMenu({ tableId: t.id, colId, ...below(button) });
    };
    return () => {
      openerRef.current = null;
    };
  });
  const tables = c.sheet.layout.tables;
  if (!open || !tables?.length) return null;
  const editor = c.canShape;
  const inTable = (t: SheetTable) => {
    const p = posRangeOf(c.sheet.layout, t);
    if (p)
      c.setSelection({
        ranges: [{ r1: p.r1, c1: p.c1, r2: p.r1, c2: p.c1 }],
        active: { r: p.r1, c: p.c1 },
        anchor: { r: p.r1, c: p.c1 },
      });
  };
  const rename = (t: SheetTable, name: string) => {
    setRenaming(null);
    if (name.trim() === t.name) return;
    const others = c.workbook
      .sheetList()
      .filter((s) => s.id !== c.sheet.id)
      .map((s) => s.layout);
    const problem = tableNameProblem(name, c.sheet.layout, { except: t.id, others });
    if (problem) {
      debugLog('[sheet] table refused', { reason: 'name' });
      c.toast(problem);
      return;
    }
    actions.setTable({ ...t, name: name.trim() });
  };
  const shown = menu && tables.find((t) => t.id === menu.tableId);
  const columnTable = columnMenu && tables.find((t) => t.id === columnMenu.tableId);
  const filterTable = filterMenu && tables.find((t) => t.id === filterMenu.tableId);
  // A table's filter is drawn, and its buttons filter, unless a filter view is open in its place (D482).
  const filtering = (t: SheetTable) => !!t.filter && !c.filterViews.open;
  const namesOf = (t: SheetTable) =>
    tableColumnNames(c.sheet.layout, t, (r, col) => cellText(c.sheet, r, col));
  const columnName = (t: SheetTable, colId: string) => {
    const p = posRangeOf(c.sheet.layout, t);
    const at = c.sheet.layout.cols.indexOf(colId);
    return (p && namesOf(t)[at - p.c1]) ?? colId;
  };
  const run = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };
  return (
    <div ref={root} data-sheet-tables="" className="pointer-events-none absolute inset-0">
      {tables.map((t) => {
        const p = posRangeOf(c.sheet.layout, t);
        if (!p) return null;
        const names = namesOf(t);
        return names.map((columnName, i) => {
          const colId = c.sheet.layout.cols[p.c1 + i]!;
          const r = rectOf(
            c.geometry,
            { r1: p.r1, c1: p.c1 + i, r2: p.r1, c2: p.c1 + i },
            c.scroll,
          );
          if (r.w < COLUMN_BUTTON * 2) return null;
          const filters = filtering(t);
          const filtered = filters && !!t.filter![colId];
          return (
            <button
              key={`${t.id}:${colId}`}
              type="button"
              data-table-column={`${t.id}:${colId}`}
              data-filtered={filtered ? '' : undefined}
              aria-label={filters ? `${columnName} filter` : `${columnName} column menu`}
              aria-haspopup="dialog"
              aria-expanded={[columnMenu, filterMenu].some(
                (m) => m?.tableId === t.id && m.colId === colId,
              )}
              className="pointer-events-auto absolute flex items-center justify-center rounded text-xs opacity-70 hover:opacity-100 focus-visible:opacity-100"
              style={{
                left: r.x + r.w - COLUMN_BUTTON - 2,
                top: r.y + (r.h - COLUMN_BUTTON) / 2,
                width: COLUMN_BUTTON,
                height: COLUMN_BUTTON,
                // A filtered column's button filled, as the sheet's filter's.
                ...(filtered
                  ? { backgroundColor: c.palette.focus, color: '#ffffff', opacity: 1 }
                  : { color: c.palette.text }),
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) =>
                (filters ? setFilterMenu : setColumnMenu)({
                  tableId: t.id,
                  colId,
                  ...below(e.currentTarget),
                })
              }
            >
              {filtered ? <FilterIcon /> : <span aria-hidden>▾</span>}
            </button>
          );
        });
      })}
      {tables.map((t) => {
        const p = posRangeOf(c.sheet.layout, t);
        if (!p) return null;
        const r = rectOf(c.geometry, { r1: p.r1, c1: p.c1, r2: p.r1, c2: p.c1 }, c.scroll);
        const style = {
          left: r.x,
          top: r.y >= CHIP_HEIGHT ? r.y - CHIP_HEIGHT : r.y,
          height: CHIP_HEIGHT,
          background: c.palette.surface,
          color: c.palette.text,
          borderColor: c.palette.border,
        };
        const chip =
          'pointer-events-auto absolute flex items-center gap-1 rounded-t border border-b-0 px-1.5 text-xs font-semibold shadow-sm';
        if (renaming === t.id)
          return (
            <input
              key={t.id}
              aria-label={`Rename ${t.name}`}
              autoFocus
              defaultValue={t.name}
              className={chip}
              style={style}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') rename(t, e.currentTarget.value);
                if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={(e) => rename(t, e.currentTarget.value)}
            />
          );
        return (
          <button
            key={t.id}
            type="button"
            aria-label={`${t.name} table menu`}
            aria-haspopup="dialog"
            aria-expanded={menu?.tableId === t.id}
            className={chip}
            style={style}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => setMenu({ tableId: t.id, ...below(e.currentTarget) })}
          >
            {t.name}
            <span aria-hidden>▾</span>
          </button>
        );
      })}
      {shown ? (
        <ContextMenu
          position={{ x: menu.x, y: menu.y }}
          label={`${shown.name} table menu`}
          onClose={() => setMenu(null)}
        >
          <MenuHeader title={shown.name} />
          <MenuActionRow
            label="Table Settings"
            icon={<Glyph t="⚙" />}
            onClick={run(() => {
              inTable(shown);
              open(shown.id);
            })}
          />
          <MenuActionRow
            label="Rename"
            icon={<Glyph t="✎" />}
            disabled={!editor}
            onClick={run(() => setRenaming(shown.id))}
          />
          <MenuActionRow
            label="Select Table"
            icon={<Glyph t="▦" />}
            onClick={run(() => actions.selectTable(shown.id))}
          />
          <MenuActionRow
            label="Filter"
            icon={shown.filter ? <Glyph t="✓" /> : <span aria-hidden />}
            checked={shown.filter !== undefined}
            disabled={!editor}
            onClick={run(() => actions.toggleTableFilter(shown.id))}
          />
          <ContextMenuDivider />
          <MenuActionRow
            label="Convert to Range"
            icon={<Glyph t="⊞" />}
            disabled={!editor}
            onClick={run(() => actions.convertToRange(shown.id))}
          />
          <MenuActionRow
            label="Delete Table"
            icon={<Glyph t="−" />}
            disabled={!editor}
            onClick={run(() => actions.deleteTable(shown.id))}
          />
        </ContextMenu>
      ) : null}
      {columnMenu && columnTable ? (
        <TableColumnMenu
          table={columnTable}
          colId={columnMenu.colId}
          name={columnName(columnTable, columnMenu.colId)}
          position={{ x: columnMenu.x, y: columnMenu.y }}
          onClose={() => setColumnMenu(null)}
        />
      ) : null}
      {filterMenu && filterTable ? (
        <FilterMenu
          key={`${filterTable.id}:${filterMenu.colId}`}
          table={filterTable}
          colId={filterMenu.colId}
          at={{ x: filterMenu.x, y: filterMenu.y }}
          actions={actions}
          onClose={() => setFilterMenu(null)}
          onColumnMenu={() => {
            setFilterMenu(null);
            setColumnMenu(filterMenu);
          }}
        />
      ) : null}
    </div>
  );
}

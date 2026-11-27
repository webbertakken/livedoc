'use client';

// Each table's chip over the grid and its table menu (docs/specs/029-sheets/data-tools.md "Tables"): the table's name
// above its header row's first cell (on it, when the header is the sheet's first row). Pressing it, or Enter or Space
// on it, opens the menu: Table Settings, Rename (the name in place on the chip), Select Table, Convert to Range and
// Delete Table, as Google's table menu. Everyone sees it; what changes the table is an Editor's, dimmed for others.
import { useContext, useState } from 'react';
import { posRangeOf, tableNameProblem, type SheetTable } from '@livedoc/sheets';
import { ContextMenu, ContextMenuDivider } from '@/components/palette/ContextMenu';
import { MenuActionRow, MenuHeader } from '@/components/primitives/PortalMenu';
import { debugLog } from '@/lib/debug-log';
import { Glyph } from '../SheetCellMenu';
import { useSheetController } from '../sheet-controller';
import { rectOf } from '../SheetSelectionLayer';
import { useSheetActions } from '../useSheetActions';
import { TableSettingsContext } from './table-settings-context';

const CHIP_HEIGHT = 20;

type MenuAt = { tableId: string; x: number; y: number };

export function SheetTablesLayer() {
  const c = useSheetController();
  const actions = useSheetActions();
  const open = useContext(TableSettingsContext);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
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
  const run = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };
  return (
    <div data-sheet-tables="" className="pointer-events-none absolute inset-0">
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
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setMenu({ tableId: t.id, x: box.left, y: box.bottom });
            }}
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
    </div>
  );
}

'use client';

// The grid's menus (docs/specs/029-sheets/sheet.md "Cell menu", "Rows and columns", "Filter", "Sort"): the cell menu
// and a header's menu at the pointer, a filter column's menu (FilterMenu), and Custom Sort. Rows in the shared
// context menu; every row that changes something only for someone who may edit.
import { Button } from '@livedoc/ui';
import { useState, type ReactNode } from 'react';
import { columnLetters, type SortKey } from '@livedoc/sheets';
import { ContextMenu } from '@/components/palette/ContextMenu';
import { useSheetController, type OpenMenu } from './sheet-controller';
import type { SheetActions } from './useSheetActions';
import { SheetCellMenu } from './SheetCellMenu';
import { FilterMenu } from './FilterMenu';
import { SheetLinesMenu } from './SheetLinesMenu';
import { SheetResizeDialog } from './SheetResizeDialog';
import { SheetHeaderMenu } from './SheetHeaderMenu';
import { SheetGroupMenu } from './SheetGroupMenu';
import { SheetOutlineMenu } from './SheetOutlineMenu';

/** A cell's or a header's menu: a spreadsheet draws its own (surface.md "Context menus"), a Plan Sheet these. */
export type GridContextMenu = Extract<OpenMenu, { kind: 'cell' | 'header' }>;

export function SheetMenus({
  actions,
  contextMenu,
}: {
  actions: SheetActions;
  contextMenu?: (menu: GridContextMenu, onClose: () => void) => ReactNode;
}) {
  const c = useSheetController();
  const menu = c.menu;
  if (!menu) return null;
  const close = () => {
    c.setMenu(null);
    c.focusGrid();
  };
  if (contextMenu && (menu.kind === 'cell' || menu.kind === 'header'))
    return contextMenu(menu, close);
  if (menu.kind === 'cell')
    return <SheetCellMenu at={{ x: menu.x, y: menu.y }} actions={actions} onClose={close} />;
  if (menu.kind === 'lines')
    return (
      <SheetLinesMenu
        op={menu.op}
        at={{ x: menu.x, y: menu.y }}
        actions={actions}
        onClose={close}
      />
    );
  if (menu.kind === 'resize')
    return (
      <SheetResizeDialog
        axis={menu.axis}
        from={menu.from}
        to={menu.to}
        actions={actions}
        onClose={close}
      />
    );
  if (menu.kind === 'header')
    return <SheetHeaderMenu menu={menu} actions={actions} onClose={close} />;
  if (menu.kind === 'group')
    return (
      <SheetGroupMenu
        op={menu.op}
        at={{ x: menu.x, y: menu.y }}
        actions={actions}
        onClose={close}
      />
    );
  if (menu.kind === 'outline')
    return (
      <SheetOutlineMenu
        axis={menu.axis}
        at={{ x: menu.x, y: menu.y }}
        actions={actions}
        onClose={close}
      />
    );
  if (menu.kind === 'filter')
    return (
      <FilterMenu
        colId={menu.colId}
        at={{ x: menu.x, y: menu.y }}
        actions={actions}
        onClose={close}
      />
    );
  return <SortDialog actions={actions} onClose={close} />;
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function SortDialog({ actions, onClose }: { actions: SheetActions; onClose: () => void }) {
  const c = useSheetController();
  const g = c.selection.ranges[c.selection.ranges.length - 1]!;
  const [keys, setKeys] = useState<SortKey[]>([{ col: g.c1, ascending: true }]);
  const [header, setHeader] = useState(false);
  const cols = range(g.c1, g.c2);
  const rect = c.gridEl?.getBoundingClientRect();
  return (
    <ContextMenu
      position={{ x: (rect?.left ?? 100) + 60, y: (rect?.top ?? 100) + 40 }}
      label="Custom Sort"
      onClose={onClose}
    >
      <div className="w-72 px-3 py-2 text-body" onKeyDown={(e) => e.stopPropagation()}>
        <div className="mb-2 text-supporting text-slate-500 dark:text-slate-400">Custom Sort</div>
        <label className="mb-2 flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
          Data has a header row
        </label>
        {keys.map((k, i) => (
          <div key={i} className="mb-1 flex items-center gap-2">
            <span className="w-14">{i === 0 ? 'Sort by' : 'Then by'}</span>
            <select
              aria-label="Column"
              className="h-field flex-1 rounded-control border bg-transparent px-1"
              style={{ borderColor: c.palette.border }}
              value={k.col}
              onChange={(e) =>
                setKeys(keys.map((x, j) => (j === i ? { ...x, col: Number(e.target.value) } : x)))
              }
            >
              {cols.map((col) => (
                <option key={col} value={col}>
                  Column {columnLetters(col)}
                </option>
              ))}
            </select>
            <select
              aria-label="Order"
              className="h-field rounded-control border bg-transparent px-1"
              style={{ borderColor: c.palette.border }}
              value={k.ascending ? 'a' : 'z'}
              onChange={(e) =>
                setKeys(
                  keys.map((x, j) => (j === i ? { ...x, ascending: e.target.value === 'a' } : x)),
                )
              }
            >
              <option value="a">A to Z</option>
              <option value="z">Z to A</option>
            </select>
          </div>
        ))}
        <button
          type="button"
          className="mt-1 cursor-pointer underline"
          onClick={() => setKeys([...keys, { col: g.c1, ascending: true }])}
        >
          Add Another Sort Column
        </button>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="xs"

            onClick={() => {
              actions.sortRange(keys, header);
              onClose();
            }}
          >
            Sort
          </Button>
        </div>
      </div>
    </ContextMenu>
  );
}

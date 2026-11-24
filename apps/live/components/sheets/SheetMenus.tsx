'use client';

// The grid's menus (docs/specs/029-sheets/sheet.md "Cell menu", "Rows and columns", "Filter", "Sort"): the cell menu
// and a header's menu at the pointer, a filter column's values and condition, and Custom Sort. Rows in the shared
// context menu; every row that changes something only for someone who may edit.
import { Button } from '@livedoc/ui';
import { useMemo, useState, type ReactNode } from 'react';
import {
  CONDITION_OPS,
  columnLetters,
  columnValueCounts,
  type FilterCondition,
  type SortKey,
} from '@livedoc/sheets';
import { ContextMenu, ContextMenuDivider } from '@/components/palette/ContextMenu';
import { MenuActionRow } from '@/components/primitives/PortalMenu';
import { useSheetController, type OpenMenu } from './sheet-controller';
import type { SheetActions } from './useSheetActions';
import { SheetCellMenu } from './SheetCellMenu';
import { FilterIcon, SortIcon } from './sheet-icons';
import { SheetLinesMenu } from './SheetLinesMenu';
import { SheetResizeDialog } from './SheetResizeDialog';
import { SheetHeaderMenu } from './SheetHeaderMenu';
import { SheetGroupMenu } from './SheetGroupMenu';
import { SheetOutlineMenu } from './SheetOutlineMenu';

const CONDITION_LABELS: Record<NonNullable<FilterCondition['op']>, string> = {
  empty: 'Is empty',
  notEmpty: 'Is not empty',
  contains: 'Text contains',
  notContains: 'Text does not contain',
  startsWith: 'Text starts with',
  endsWith: 'Text ends with',
  exactly: 'Text is exactly',
  dateBefore: 'Date is before',
  dateAfter: 'Date is after',
  dateOn: 'Date is',
  gt: 'Greater than',
  gte: 'Greater than or equal to',
  lt: 'Less than',
  lte: 'Less than or equal to',
  between: 'Is between',
  eq: 'Is equal to',
  neq: 'Is not equal to',
};

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

function FilterMenu({
  colId,
  at,
  actions,
  onClose,
}: {
  colId: string;
  at: { x: number; y: number };
  actions: SheetActions;
  onClose: () => void;
}) {
  const c = useSheetController();
  const current = c.sheet.layout.filter?.conds[colId];
  const values = useMemo(
    () => columnValueCounts(c.workbook, c.sheet.id, colId),
    // Counted again whenever a value may have changed (`version`).
    [c.workbook, c.sheet.id, colId, c.version], // oxlint-disable-line react/exhaustive-deps
  );
  const [kept, setKept] = useState<Set<string>>(
    () => new Set(current?.values ?? values.map((v) => v.text)),
  );
  const [search, setSearch] = useState('');
  const [op, setOp] = useState<FilterCondition['op'] | ''>(current?.op ?? '');
  const [a, setA] = useState(current?.a ?? '');
  const [b, setB] = useState(current?.b ?? '');
  const shown = values.filter((v) => v.text.toLowerCase().includes(search.toLowerCase()));
  const apply = () => {
    const all = kept.size === values.length;
    const cond: FilterCondition = {
      ...(all ? {} : { values: [...kept] }),
      ...(op ? { op, ...(a ? { a } : {}), ...(op === 'between' && b ? { b } : {}) } : {}),
    };
    actions.setFilter(colId, Object.keys(cond).length ? cond : null);
    onClose();
  };
  const field = 'h-field w-full rounded-control border bg-transparent px-2 text-body outline-none';
  return (
    <ContextMenu position={at} label="Filter column" onClose={onClose}>
      <MenuActionRow
        label="Sort A to Z"
        icon={<SortIcon />}
        onClick={() => {
          actions.sortFilter(colId, true);
          onClose();
        }}
      />
      <MenuActionRow
        label="Sort Z to A"
        icon={<SortIcon />}
        onClick={() => {
          actions.sortFilter(colId, false);
          onClose();
        }}
      />
      <ContextMenuDivider />
      {/* As wide as the menu, never wider: a wider panel spilled its fields, counts and OK past the menu's edge. */}
      <div className="w-full min-w-0 px-3 py-1.5 text-body" onKeyDown={(e) => e.stopPropagation()}>
        <div className="mb-1 text-supporting text-slate-500 dark:text-slate-400">
          Filter by Values
        </div>
        <input
          aria-label="Search values"
          placeholder="Search"
          className={field}
          style={{ borderColor: c.palette.border }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-1 flex gap-3">
          <button
            type="button"
            className="cursor-pointer underline"
            onClick={() => setKept(new Set(values.map((v) => v.text)))}
          >
            Select All
          </button>
          <button
            type="button"
            className="cursor-pointer underline"
            onClick={() => setKept(new Set())}
          >
            Clear
          </button>
        </div>
        <ul className="mt-1 max-h-40 overflow-auto">
          {shown.map((v) => (
            <li key={v.text}>
              <label className="flex cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={kept.has(v.text)}
                  onChange={(e) => {
                    const next = new Set(kept);
                    if (e.target.checked) next.add(v.text);
                    else next.delete(v.text);
                    setKept(next);
                  }}
                />
                <span className="min-w-0 truncate">{v.text || '(Blanks)'}</span>
                <span className="ml-auto shrink-0" style={{ color: c.palette.muted }}>
                  {v.count}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mb-1 mt-2 text-supporting text-slate-500 dark:text-slate-400">
          Filter by Condition
        </div>
        <select
          aria-label="Condition"
          className={field}
          style={{ borderColor: c.palette.border }}
          value={op}
          onChange={(e) => setOp(e.target.value as FilterCondition['op'] | '')}
        >
          <option value="">None</option>
          {CONDITION_OPS.map((o) => (
            <option key={o} value={o}>
              {CONDITION_LABELS[o]}
            </option>
          ))}
        </select>
        {op && op !== 'empty' && op !== 'notEmpty' ? (
          <input
            aria-label="Value"
            placeholder="Value"
            className={`${field} mt-1`}
            style={{ borderColor: c.palette.border }}
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
        ) : null}
        {op === 'between' ? (
          <input
            aria-label="And"
            placeholder="And"
            className={`${field} mt-1`}
            style={{ borderColor: c.palette.border }}
            value={b}
            onChange={(e) => setB(e.target.value)}
          />
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="xs" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="xs" onClick={apply}>
            <FilterIcon /> OK
          </Button>
        </div>
      </div>
    </ContextMenu>
  );
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

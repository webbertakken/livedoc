'use client';

// A filter column's menu (docs/specs/029-sheets/sheet.md "Filter", data-tools.md "Filters, filter views and
// slicers"): Sort A to Z and Z to A over the filter's rows, then Filter by Colour, Filter by Values and Filter by
// Condition, applied together by OK, a row kept only when it meets every one set. A table's own filter (D481) has
// the same menu, opened from its header's column button, with Column Menu at its top and the column menu's sort.
import { Button } from '@livedoc/ui';
import { useMemo, useState } from 'react';
import {
  columnColours,
  columnValueCounts,
  compileTypedFormula,
  formulaAsTyped,
  tableDrawnFilter,
  type FilterColour,
  type FilterCondition,
  type SheetTable,
} from '@livedoc/sheets';
import { ContextMenu, ContextMenuDivider } from '@/components/palette/ContextMenu';
import { MenuActionRow } from '@/components/primitives/PortalMenu';
import { debugLog } from '@/lib/debug-log';
import { useSheetController } from './sheet-controller';
import type { SheetActions } from './useSheetActions';
import { FilterByColour } from './FilterByColour';
import { FilterByCondition } from './FilterByCondition';
import { conditionDraftOf, conditionOfDraft, type ConditionDraft } from './filter-condition-draft';
import { FilterIcon, SortIcon } from './sheet-icons';
import { Glyph } from './SheetCellMenu';

export function FilterMenu({
  colId,
  at,
  actions,
  onClose,
  table,
  onColumnMenu,
}: {
  colId: string;
  at: { x: number; y: number };
  actions: SheetActions;
  onClose: () => void;
  // A table's own filter's column, in place of the sheet's filter; Column Menu opens its column menu.
  table?: SheetTable;
  onColumnMenu?: () => void;
}) {
  const c = useSheetController();
  const layout = c.sheet.layout;
  const own = useMemo(() => (table ? tableDrawnFilter(layout, table) : null), [layout, table]);
  // The filter drawn: the table's own, else an open filter view's in the sheet filter's place.
  const drawn = table ? own : c.filterViews.drawn;
  const inView = !table && !!c.filterViews.open;
  const sort = (ascending: boolean) =>
    table
      ? actions.sortTableColumn(table.id, colId, ascending)
      : actions.sortFilter(colId, ascending);
  const current = drawn?.conds[colId];
  const values = useMemo(
    () => columnValueCounts(c.workbook, c.sheet.id, colId, drawn),
    // Counted again whenever a value may have changed (`version`).
    [c.workbook, c.sheet.id, colId, drawn, c.version], // oxlint-disable-line react/exhaustive-deps
  );
  const [kept, setKept] = useState<Set<string>>(
    () => new Set(current?.values ?? values.map((v) => v.text)),
  );
  const colours = useMemo(
    () => ({
      bg: columnColours(c.workbook, c.sheet.id, colId, 'bg', drawn),
      fc: columnColours(c.workbook, c.sheet.id, colId, 'fc', drawn),
    }),
    // Read again whenever a value or a format may have changed (`version`).
    [c.workbook, c.sheet.id, colId, drawn, c.version], // oxlint-disable-line react/exhaustive-deps
  );
  const [colour, setColour] = useState<FilterColour | null>(current?.colour ?? null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<ConditionDraft>(() =>
    conditionDraftOf(current, (fx) => formulaAsTyped(fx, c.workbook.ctxFor(c.sheet.id), c.locale)),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const shown = values.filter((v) => v.text.toLowerCase().includes(search.toLowerCase()));
  const apply = () => {
    const all = kept.size === values.length;
    // Custom formula is: written for the first row under the header, as the person reads it there.
    const condition = conditionOfDraft(draft, (text) => {
      const made = compileTypedFormula(text, c.locale, c.workbook.ctxFor(c.sheet.id));
      return made.ok ? made.formula : null;
    });
    if (!condition.ok) {
      debugLog('[sheet] filter formula refused', { colId });
      setProblem(condition.why);
      return;
    }
    const cond: FilterCondition = {
      ...(all ? {} : { values: [...kept] }),
      ...condition.part,
      ...(colour ? { colour } : {}),
    };
    const set = Object.keys(cond).length ? cond : null;
    if (table) actions.setTableFilter(table.id, colId, set);
    else actions.setFilter(colId, set);
    onClose();
  };
  const field = 'h-field w-full rounded-control border bg-transparent px-2 text-body outline-none';
  return (
    <ContextMenu
      position={at}
      label={table ? `${table.name} filter` : 'Filter column'}
      onClose={onClose}
    >
      {onColumnMenu ? (
        <MenuActionRow label="Column Menu" icon={<Glyph t="▾" />} onClick={onColumnMenu} />
      ) : null}
      {/* A filter view's own sort orders only what its opener sees: the drawn order (data-tools.md). */}
      {inView ? null : (
        <>
          <MenuActionRow
            label="Sort A to Z"
            icon={<SortIcon />}
            disabled={!!table && !c.canShape}
            onClick={() => {
              sort(true);
              onClose();
            }}
          />
          <MenuActionRow
            label="Sort Z to A"
            icon={<SortIcon />}
            disabled={!!table && !c.canShape}
            onClick={() => {
              sort(false);
              onClose();
            }}
          />
          <ContextMenuDivider />
        </>
      )}
      {/* As wide as the menu, never wider: a wider panel spilled its fields, counts and OK past the menu's edge. */}
      <div className="w-full min-w-0 px-3 py-1.5 text-body" onKeyDown={(e) => e.stopPropagation()}>
        <FilterByColour colours={colours} value={colour} onChange={setColour} />
        <div className="mb-1 mt-2 text-supporting text-slate-500 dark:text-slate-400">
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
        <FilterByCondition
          draft={draft}
          problem={problem}
          onChange={(next) => {
            setDraft(next);
            setProblem(null);
          }}
        />
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

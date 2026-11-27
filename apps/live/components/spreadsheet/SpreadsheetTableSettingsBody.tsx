'use client';

// The Table Settings panel's body (docs/specs/029-sheets/data-tools.md "Tables"): the settings of the table the active
// cell is in, under its name: its range, each column's type, its total row and its look (the Alternating Colours panel
// on its banding). What acts on the table (Rename, Select Table, Convert to Range, Delete Table) is the table menu's.
// Every change writes at once, one undo step each; read by everyone, changed by an Editor alone.
import { useId, useState } from 'react';
import { Button, Select, Switch, TextInput } from '@livedoc/ui';
import {
  cellText,
  formatRange,
  parseRangeText,
  posRangeOf,
  tableColumnNames,
  tableOverlaps,
  TABLE_REFUSAL_COPY,
  isSheetTable,
  type SheetTable,
  type TableColumnType,
} from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import {
  COLUMN_TYPE_CHOICES,
  COLUMN_TYPE_LABELS,
} from '@/components/sheets/tables/table-column-types';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { debugLog } from '@/lib/debug-log';

export const NO_TABLE = 'Select a cell in a table to see its settings.';
export const TABLE_RANGE_UNREAD = 'Type a range like A1:D20, a header row and a data row at least';

const label = 'text-supporting text-slate-600 dark:text-slate-300';
const error = 'text-supporting text-red-700 dark:text-red-300';

export function SpreadsheetTableSettingsBody({
  actions,
  onFormatting,
  onClose,
}: {
  actions: SheetActions;
  // Table Formatting: the Alternating Colours panel on the table's banding.
  onFormatting: () => void;
  onClose: () => void;
}) {
  const c = useSheetController();
  const table = actions.activeTable();
  const p = table ? posRangeOf(c.sheet.layout, table) : null;
  if (!table || !p)
    return <p className="text-supporting text-slate-500 dark:text-slate-400">{NO_TABLE}</p>;
  // A new table or a range changed elsewhere starts the fields afresh.
  const shownRange = formatRange(p);
  return (
    <TableSettingsFields
      key={`${table.id}:${shownRange}`}
      table={table}
      shownRange={shownRange}
      actions={actions}
      onFormatting={onFormatting}
      onClose={onClose}
    />
  );
}

function TableSettingsFields({
  table,
  shownRange,
  actions,
  onFormatting,
  onClose,
}: {
  table: SheetTable;
  shownRange: string;
  actions: SheetActions;
  onFormatting: () => void;
  onClose: () => void;
}) {
  const c = useSheetController();
  const id = useId();
  const layout = c.sheet.layout;
  const p = posRangeOf(layout, table)!;
  const [range, setRange] = useState(shownRange);
  const [why, setWhy] = useState<string | null>(null);
  const editor = c.canShape;
  const refuse = (message: string) => {
    debugLog('[sheet] table refused', { reason: 'range' });
    setWhy(message);
  };
  const commitRange = () => {
    if (range.trim() === shownRange) return;
    const g = parseRangeText(range);
    const ids =
      g && g.r2 < layout.rows.length && g.c2 < layout.cols.length ? actions.rangeIds(g) : null;
    if (!g || !ids) return refuse(TABLE_RANGE_UNREAD);
    const next = { ...table, ...ids };
    if (tableOverlaps(layout, next)) return refuse(TABLE_REFUSAL_COPY.overlap);
    if (!isSheetTable(next, table.id, layout)) return refuse(TABLE_RANGE_UNREAD);
    if (actions.setTable(next)) actions.goTo(g);
  };
  const names = tableColumnNames(layout, table, (r, col) => cellText(c.sheet, r, col));
  const setType = (col: string, type: TableColumnType | 'none') =>
    actions.setColumnType(table.id, col, type === 'none' ? null : type);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-body text-slate-900 dark:text-slate-100">{table.name}</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-range`} className={label}>
          Range
        </label>
        <TextInput
          id={`${id}-range`}
          value={range}
          readOnly={!editor}
          aria-invalid={why ? true : undefined}
          aria-describedby={why ? `${id}-range-why` : undefined}
          onChange={(e) => {
            setWhy(null);
            setRange(e.target.value);
          }}
          onBlur={commitRange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRange();
          }}
        />
        {why ? (
          <span id={`${id}-range-why`} role="alert" className={error}>
            {why}
          </span>
        ) : null}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className={label}>Column Types</legend>
        {names.map((columnName, i) => {
          const col = layout.cols[p.c1 + i]!;
          const type = table.types?.[col] ?? 'none';
          return (
            <label key={col} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{columnName}</span>
              <Select
                size="sm"
                className="w-32"
                aria-label={`${columnName} type`}
                value={type}
                disabled={!editor}
                onChange={(e) => setType(col, e.target.value as TableColumnType | 'none')}
              >
                {COLUMN_TYPE_CHOICES.map((t) => (
                  <option key={t} value={t}>
                    {COLUMN_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </label>
          );
        })}
      </fieldset>
      <label className="flex cursor-pointer items-center gap-2">
        <Switch
          size="sm"
          checked={!!table.total}
          disabled={!editor}
          onChange={() => actions.setTotalRow(table.id, !table.total)}
          label="Total Row"
        />
        Total Row
      </label>
      {editor ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="xs"
            onClick={() => {
              actions.selectTable(table.id);
              onFormatting();
            }}
          >
            Table Formatting
          </Button>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button size="xs" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

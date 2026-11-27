'use client';

// The Table Settings panel's body (docs/specs/029-sheets/data-tools.md "Tables"): the table the active cell is in, its
// name, its range, each column's type, its total row and its look (the Alternating Colours panel on its banding), and
// Select Table and Delete Table. Every change writes at once, one undo step each; read by everyone, changed by an
// Editor alone.
import { useEffect, useId, useState } from 'react';
import { Button, Select, Switch, TextInput } from '@livedoc/ui';
import {
  cellText,
  formatRange,
  parseRangeText,
  posRangeOf,
  tableColumnNames,
  tableNameProblem,
  tableOverlaps,
  TABLE_COLUMN_TYPES,
  TABLE_REFUSAL_COPY,
  isSheetTable,
  type TableColumnType,
} from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { debugLog } from '@/lib/debug-log';

export const NO_TABLE = 'Select a cell in a table to see its settings.';
export const TABLE_RANGE_UNREAD = 'Type a range like A1:D20, a header row and a data row at least';

/** Each column type's words, None first (data-tools.md "Tables"). */
export const COLUMN_TYPE_LABELS: Readonly<Record<TableColumnType | 'none', string>> = {
  none: 'None',
  text: 'Text',
  number: 'Number',
  percent: 'Percent',
  currency: 'Currency',
  date: 'Date',
  time: 'Time',
  dateTime: 'Date Time',
  dropdown: 'Dropdown',
  checkbox: 'Checkbox',
};

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
  const id = useId();
  const table = actions.activeTable();
  const layout = c.sheet.layout;
  const p = table ? posRangeOf(layout, table) : null;
  const shownRange = p ? formatRange(p) : '';
  const [name, setName] = useState(table?.name ?? '');
  const [range, setRange] = useState(shownRange);
  const [why, setWhy] = useState<{ name?: string; range?: string }>({});
  useEffect(() => {
    setName(table?.name ?? '');
    setRange(shownRange);
    setWhy({});
  }, [table?.id, table?.name, shownRange]);

  if (!table || !p)
    return <p className="text-supporting text-slate-500 dark:text-slate-400">{NO_TABLE}</p>;
  const editor = c.canShape;
  const refuse = (field: 'name' | 'range', message: string) => {
    debugLog('[sheet] table refused', { reason: field });
    setWhy({ [field]: message });
  };
  const commitName = () => {
    if (name.trim() === table.name) return;
    const others = c.workbook
      .sheetList()
      .filter((s) => s.id !== c.sheet.id)
      .map((s) => s.layout);
    const problem = tableNameProblem(name, layout, { except: table.id, others });
    if (problem) return refuse('name', problem);
    actions.setTable({ ...table, name: name.trim() });
  };
  const commitRange = () => {
    if (range.trim() === shownRange) return;
    const g = parseRangeText(range);
    const ids =
      g && g.r2 < layout.rows.length && g.c2 < layout.cols.length ? actions.rangeIds(g) : null;
    if (!g || !ids) return refuse('range', TABLE_RANGE_UNREAD);
    const next = { ...table, ...ids };
    if (tableOverlaps(layout, next)) return refuse('range', TABLE_REFUSAL_COPY.overlap);
    if (!isSheetTable(next, table.id, layout)) return refuse('range', TABLE_RANGE_UNREAD);
    if (actions.setTable(next)) actions.goTo(g);
  };
  const names = tableColumnNames(layout, table, (r, col) => cellText(c.sheet, r, col));
  const setType = (col: string, type: TableColumnType | 'none') => {
    const { [col]: _was, ...types } = table.types ?? {};
    const { [col]: _opts, ...opts } = table.opts ?? {};
    const { types: _t, opts: _o, ...rest } = table;
    const nextTypes = type === 'none' ? types : { ...types, [col]: type };
    actions.setTable({
      ...rest,
      ...(Object.keys(nextTypes).length ? { types: nextTypes } : {}),
      // A Dropdown keeps its options; another type drops them.
      ...(type === 'dropdown' && table.opts?.[col]
        ? { opts: { ...opts, [col]: table.opts[col]! } }
        : Object.keys(opts).length
          ? { opts }
          : {}),
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className={label}>
          Table Name
        </label>
        <TextInput
          id={`${id}-name`}
          value={name}
          readOnly={!editor}
          aria-invalid={why.name ? true : undefined}
          aria-describedby={why.name ? `${id}-name-why` : undefined}
          onChange={(e) => {
            setWhy({});
            setName(e.target.value);
          }}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
          }}
        />
        {why.name ? (
          <span id={`${id}-name-why`} role="alert" className={error}>
            {why.name}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-range`} className={label}>
          Range
        </label>
        <TextInput
          id={`${id}-range`}
          value={range}
          readOnly={!editor}
          aria-invalid={why.range ? true : undefined}
          aria-describedby={why.range ? `${id}-range-why` : undefined}
          onChange={(e) => {
            setWhy({});
            setRange(e.target.value);
          }}
          onBlur={commitRange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRange();
          }}
        />
        {why.range ? (
          <span id={`${id}-range-why`} role="alert" className={error}>
            {why.range}
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
                {(['none', ...TABLE_COLUMN_TYPES] as const).map((t) => (
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
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="xs" onClick={() => actions.selectTable(table.id)}>
          Select Table
        </Button>
        {editor ? (
          <>
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
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                if (actions.convertToRange(table.id)) onClose();
              }}
            >
              Convert to Range
            </Button>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                if (actions.deleteTable(table.id)) onClose();
              }}
            >
              Delete Table
            </Button>
          </>
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button size="xs" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

'use client';

// The Pivot Table Editor side panel's body (docs/specs/029-sheets/pivot-tables.md "Pivot Table Editor"): the Range,
// Suggested, then Rows, Columns, Values (with Values As) and Filters, each with Add and its entries. Each change writes
// the pivot table whole at once, one undo step; the Range writes when it is left or Enter is pressed.
import { readWorkbook } from '@/components/sheets/read-workbook';
import { useId, useState } from 'react';
import { Button, Select, TextInput } from '@livedoc/ui';
import {
  pivotAdd,
  pivotAddCalculated,
  pivotColumns,
  pivotFilterItems,
  pivotRemove,
  pivotSuggestions,
  pivotWithEntry,
  pivotWithSource,
  type PivotArea,
  type PivotColumn,
  type SheetPivot,
  type SheetPivotValue,
} from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import {
  PIVOT_RANGE_WHY,
  pivotRangeText,
  readSheetRange,
  sourceFor,
} from '@/lib/spreadsheet/pivot-create';
import { ChartEditorField as Field } from '../charts/ChartEditorField';
import { PivotAddMenu } from './PivotAddMenu';
import { PivotFilterEntry, PivotGroupEntry, PivotValueEntry } from './PivotEntries';

export const PIVOT_GONE = 'This pivot table is no longer on the sheet.';

const SECTIONS: readonly { area: PivotArea; title: string }[] = [
  { area: 'rows', title: 'Rows' },
  { area: 'columns', title: 'Columns' },
  { area: 'values', title: 'Values' },
  { area: 'filters', title: 'Filters' },
];

const SUGGESTION =
  'min-h-row cursor-pointer rounded-control border border-(--office-line) px-2 py-1 text-left text-supporting text-(--office-ink) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

// A value's name as the output labels it (pivot-tables.md "The output", "Labels").
function valueName(v: SheetPivotValue, nameOf: (col: string) => string): string {
  if (v.name) return v.name;
  return v.formula === undefined ? `${v.summary} of ${nameOf(v.col)}` : v.summary;
}

export function PivotEditorBody({
  pivotId,
  onChange,
  onClose,
}: {
  pivotId: string | null;
  onChange: (next: SheetPivot) => void;
  onClose: () => void;
}) {
  const c = useSheetController();
  const ids = useId();
  const pivot = (c.sheet.layout.objects ?? []).find(
    (x): x is SheetPivot => x.kind === 'pivot' && x.id === pivotId,
  );
  const read = pivot
    ? readWorkbook(c.version, () => c.workbook.pivotSourceOf(c.sheet.id, pivot))
    : null;
  const shown = read && pivot?.source ? pivotRangeText(read.box.sheet, pivot.source) : '';
  const [range, setRange] = useState(shown);
  const [why, setWhy] = useState<string | null>(null);
  const [shownBefore, setShownBefore] = useState(shown);
  if (shownBefore !== shown) {
    setShownBefore(shown);
    setRange(shown);
    setWhy(null);
  }
  if (!pivot) return <p className="text-supporting text-(--office-muted)">{PIVOT_GONE}</p>;

  const columns = read ? pivotColumns(read) : [];
  const nameOf = (col: string) => columns.find((x) => x.col === col)?.name ?? col;
  const valueNames = (pivot.values ?? []).map((v) => valueName(v, nameOf));
  const grouped = new Set([...(pivot.rows ?? []), ...(pivot.columns ?? [])].map((g) => g.col));
  const addable = (area: PivotArea): PivotColumn[] =>
    area === 'rows' || area === 'columns' ? columns.filter((x) => !grouped.has(x.col)) : columns;

  const commitRange = () => {
    if (range.trim() === shown) return;
    const picked = readSheetRange(c.workbook.ctxFor(c.sheet.id), range);
    if (!picked) {
      setWhy(PIVOT_RANGE_WHY);
      return;
    }
    setWhy(null);
    const p = picked.sheet.layout;
    const from = p.cols.indexOf(picked.range.c1);
    const to = p.cols.indexOf(picked.range.c2);
    onChange(
      pivotWithSource(
        pivot,
        sourceFor(c.sheet.id, picked.sheet.id, picked.range),
        p.cols.slice(Math.min(from, to), Math.max(from, to) + 1),
      ),
    );
  };
  const suggestions = pivotSuggestions(columns);

  const entries = (area: PivotArea) => {
    const remove = (i: number) => () => onChange(pivotRemove(pivot, area, i));
    if (area === 'values')
      return (pivot.values ?? []).map((v, i) => (
        <PivotValueEntry
          key={i}
          name={valueNames[i]!}
          value={v}
          onChange={(next) => onChange(pivotWithEntry(pivot, 'values', i, next))}
          onRemove={remove(i)}
        />
      ));
    if (area === 'filters')
      return (pivot.filters ?? []).map((f, i) => (
        <PivotFilterEntry
          key={i}
          name={nameOf(f.col)}
          filter={f}
          items={read ? pivotFilterItems(read, f.col) : []}
          onChange={(next) => onChange(pivotWithEntry(pivot, 'filters', i, next))}
          onRemove={remove(i)}
        />
      ));
    return (pivot[area] ?? []).map((g, i) => (
      <PivotGroupEntry
        key={i}
        name={nameOf(g.col)}
        group={g}
        rows={area === 'rows'}
        valueNames={valueNames}
        onChange={(next) => onChange(pivotWithEntry(pivot, area, i, next))}
        onRemove={remove(i)}
      />
    ));
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Range">
        <TextInput
          aria-label="Range"
          aria-invalid={why ? true : undefined}
          aria-describedby={why ? `${ids}-why` : undefined}
          value={range}
          placeholder="Sheet1!A1:F25"
          onChange={(e) => setRange(e.target.value)}
          onBlur={commitRange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRange();
          }}
        />
      </Field>
      {why ? (
        <p
          id={`${ids}-why`}
          role="alert"
          className="text-supporting text-red-700 dark:text-red-300"
        >
          {why}
        </p>
      ) : null}
      {suggestions.length ? (
        <div role="group" aria-label="Suggested" className="flex flex-col gap-1">
          <span className="text-supporting text-(--office-muted)">Suggested</span>
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              className={SUGGESTION}
              onClick={() => {
                const { rows: _r, columns: _c, values: _v, filters: _f, ...rest } = pivot;
                onChange({ ...rest, rows: s.rows, values: s.values });
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      {SECTIONS.map(({ area, title }) => (
        <section key={area} aria-labelledby={`${ids}-${area}`} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 id={`${ids}-${area}`} className="text-body font-medium">
              {title}
            </h3>
            <span className="flex items-center gap-2">
              {area === 'values' && pivot.values?.length ? (
                <Select
                  aria-label="Values As"
                  value={pivot.valuesAsRows ? 'rows' : 'columns'}
                  onChange={(e) => {
                    const { valuesAsRows: _was, ...rest } = pivot;
                    onChange(e.target.value === 'rows' ? { ...rest, valuesAsRows: true } : rest);
                  }}
                >
                  <option value="columns">Values As Columns</option>
                  <option value="rows">Values As Rows</option>
                </Select>
              ) : null}
              <PivotAddMenu
                section={title}
                columns={addable(area)}
                onPick={(column) => onChange(pivotAdd(pivot, area, column))}
                {...(area === 'values'
                  ? {
                      extra: {
                        label: 'Calculated Field',
                        onPick: () => onChange(pivotAddCalculated(pivot, valueNames)),
                      },
                    }
                  : {})}
              />
            </span>
          </div>
          {entries(area)}
        </section>
      ))}
      <div className="flex justify-end">
        <Button size="xs" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

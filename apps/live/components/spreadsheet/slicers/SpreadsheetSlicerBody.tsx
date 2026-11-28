'use client';

// The Slicer panel's body (docs/specs/029-sheets/data-tools.md "Slicers"): the slicer's Data Range, Column (the
// range's header names, as Advanced Range Sorting offers them), Title (empty shows the column's name) and Apply to
// Pivot Tables. Each change writes at once, one undo step; an Editor's (the panel opens from Edit Slicer).
import { useId, useState } from 'react';
import { Select, Switch, TextInput } from '@livedoc/ui';
import {
  formatRange,
  idRangeOf,
  parseRangeText,
  posRangeOf,
  sheetSlicers,
  SLICER_TITLE_MAX,
  type SheetSlicer,
} from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { slicerColumns } from '@/components/sheets/slicers/slicer-columns';
import { debugLog } from '@/lib/debug-log';

export const NO_SLICER = 'That slicer was deleted.';
export const SLICER_RANGE_UNREAD = 'Type a range like A1:D20';

const label = 'text-supporting text-slate-600 dark:text-slate-300';
const error = 'text-supporting text-red-700 dark:text-red-300';

export function SpreadsheetSlicerBody({
  slicerId,
  onChange,
}: {
  slicerId: string | null;
  onChange: (next: SheetSlicer, what: string) => boolean;
}) {
  const c = useSheetController();
  const slicer = sheetSlicers(c.sheet.layout).find((x) => x.id === slicerId);
  if (!slicer)
    return <p className="text-supporting text-slate-500 dark:text-slate-400">{NO_SLICER}</p>;
  const p = slicer.range ? posRangeOf(c.sheet.layout, slicer.range) : null;
  const shownRange = p ? formatRange(p) : '';
  // A range changed elsewhere starts the fields afresh.
  return (
    <SlicerFields
      key={`${slicer.id}:${shownRange}:${slicer.title ?? ''}`}
      slicer={slicer}
      shownRange={shownRange}
      onChange={onChange}
    />
  );
}

function SlicerFields({
  slicer,
  shownRange,
  onChange,
}: {
  slicer: SheetSlicer;
  shownRange: string;
  onChange: (next: SheetSlicer, what: string) => boolean;
}) {
  const c = useSheetController();
  const id = useId();
  const [range, setRange] = useState(shownRange);
  const [why, setWhy] = useState<string | null>(null);
  const [title, setTitle] = useState(slicer.title ?? '');
  const columns = slicerColumns(c, slicer);
  const commitRange = () => {
    if (range.trim() === shownRange) return;
    const box = parseRangeText(range);
    const ids = box ? idRangeOf(c.sheet.layout, box.r1, box.c1, box.r2, box.c2) : null;
    if (!box || !ids) {
      debugLog('[sheet] slicer refused', { reason: 'range' });
      setWhy(SLICER_RANGE_UNREAD);
      return;
    }
    const cols = c.sheet.layout.cols.slice(box.c1, box.c2 + 1);
    // Its column kept while still in the range, else the range's first; its filter goes with a new column.
    const kept = slicer.col && cols.includes(slicer.col);
    const { filter: _f, ...rest } = slicer;
    onChange(
      kept ? { ...slicer, range: ids } : { ...rest, range: ids, col: cols[0]! },
      'range changed',
    );
  };
  const commitTitle = () => {
    const next = title.trim();
    if (next === (slicer.title ?? '')) return;
    const { title: _t, ...rest } = slicer;
    onChange(next ? { ...rest, title: next } : rest, 'retitled');
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-range`} className={label}>
          Data Range
        </label>
        <TextInput
          id={`${id}-range`}
          value={range}
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
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-col`} className={label}>
          Column
        </label>
        <Select
          id={`${id}-col`}
          size="sm"
          value={slicer.col && columns.some((x) => x.id === slicer.col) ? slicer.col : ''}
          disabled={columns.length === 0}
          onChange={(e) => {
            const { filter: _f, ...rest } = slicer;
            onChange({ ...rest, col: e.target.value }, 'column changed');
          }}
        >
          {slicer.col && columns.some((x) => x.id === slicer.col) ? null : (
            <option value="" disabled>
              Choose a column
            </option>
          )}
          {columns.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-title`} className={label}>
          Title
        </label>
        <TextInput
          id={`${id}-title`}
          value={title}
          maxLength={SLICER_TITLE_MAX}
          placeholder={columns.find((x) => x.id === slicer.col)?.label}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTitle();
          }}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <Switch
          size="sm"
          checked={slicer.pivots !== false}
          onChange={() => {
            const { pivots: _p, ...rest } = slicer;
            onChange(slicer.pivots === false ? rest : { ...rest, pivots: false }, 'pivots changed');
          }}
          label="Apply to Pivot Tables"
        />
        Apply to Pivot Tables
      </label>
    </div>
  );
}

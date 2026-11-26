'use client';

// Data › Sort Range › Advanced Range Sorting Options (docs/specs/029-sheets/data-tools.md "Sort"): the shell's dialog,
// titled by the range, with "Data has header row", the sort keys in order (each a column and A to Z or Z to A, the
// added ones removable) and Add Another Sort Column. Sort runs every key at once, one undo step.
import { useId, useState } from 'react';
import type { GridRange, SortKey } from '@livedoc/sheets';
import { ChevronDownIcon, TrashIcon } from '@livedoc/ui';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import {
  addSortKey,
  removeSortKey,
  sortRangeColumns,
  sortRangeTitle,
} from '@/lib/spreadsheet/sort-range';

const SELECT =
  'h-field w-full min-w-0 cursor-pointer appearance-none truncate rounded-control border border-(--office-line) bg-transparent pr-6 pl-3 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) [&>option]:bg-(--office-menu)';
const BOX = 'size-icon-row shrink-0 accent-(--office-primary)';
const OPTION = 'flex min-h-row items-center gap-2 text-body pointer-coarse:min-h-11';
const ICON_BUTTON =
  'flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-full text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

export function SortRangeDialog({
  range,
  start,
  headerText,
  onSort,
  onClose,
}: {
  range: GridRange;
  // The keys it opens with (the active column, A to Z).
  start: readonly SortKey[];
  // A column's text in the range's first row, read when "Data has header row" is ticked.
  headerText: (col: number) => string;
  onSort: (keys: SortKey[], header: boolean) => void;
  onClose: () => void;
}) {
  const name = useId();
  const [header, setHeader] = useState(false);
  const [keys, setKeys] = useState<readonly SortKey[]>(start);
  const columns = sortRangeColumns(range, header, headerText);
  const change = (at: number, key: SortKey) => setKeys(keys.map((k, i) => (i === at ? key : k)));
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title={sortRangeTitle(range)}
      primary={{ label: 'Sort', onPress: () => onSort([...keys], header) }}
    >
      <div className="flex flex-col gap-2 pt-1">
        <label className={OPTION}>
          <input
            type="checkbox"
            className={BOX}
            checked={header}
            onChange={(e) => setHeader(e.target.checked)}
          />
          Data has header row
        </label>
        {keys.map((key, at) => (
          <fieldset key={at} className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <legend className="sr-only">{at === 0 ? 'Sort by' : 'Then by'}</legend>
            <label className="flex min-w-0 flex-1 items-center gap-2 text-body text-(--office-muted)">
              <span className="w-16 shrink-0">{at === 0 ? 'Sort by' : 'Then by'}</span>
              <span className="relative inline-flex min-w-0 flex-1">
                <select
                  className={SELECT}
                  value={key.col}
                  onChange={(e) => change(at, { ...key, col: Number(e.target.value) })}
                >
                  {columns.map((column) => (
                    <option key={column.col} value={column.col}>
                      {column.label}
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-(--office-icon)"
                >
                  <ChevronDownIcon size={14} />
                </span>
              </span>
            </label>
            <span className="flex items-center gap-3">
              {([true, false] as const).map((ascending) => (
                <label key={String(ascending)} className={OPTION}>
                  <input
                    type="radio"
                    name={`${name}-${at}`}
                    className={BOX}
                    checked={key.ascending === ascending}
                    onChange={() => change(at, { ...key, ascending })}
                  />
                  {ascending ? 'A → Z' : 'Z → A'}
                </label>
              ))}
              {at === 0 ? (
                <span aria-hidden="true" className="size-chip shrink-0" />
              ) : (
                <button
                  type="button"
                  aria-label={`Remove sort column ${at + 1}`}
                  className={ICON_BUTTON}
                  onClick={() => setKeys(removeSortKey(keys, at))}
                >
                  <TrashIcon size={16} />
                </button>
              )}
            </span>
          </fieldset>
        ))}
        <button
          type="button"
          className="mr-auto min-h-row cursor-pointer rounded-control px-1 text-body font-medium text-(--office-primary) hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
          onClick={() => setKeys(addSortKey(keys, range))}
        >
          Add Another Sort Column
        </button>
      </div>
    </OfficeDialog>
  );
}

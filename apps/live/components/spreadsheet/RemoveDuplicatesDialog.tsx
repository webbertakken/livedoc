'use client';

// Data › Data Clean-up › Remove Duplicates (docs/specs/029-sheets/data-tools.md "Remove Duplicates"): the shell's
// dialog over the range, with "Data has header row" and the columns to analyse; Remove Duplicates runs the engine's
// removal, one undo step, and the dialog then says what it found, with OK.
import { useState } from 'react';
import type { GridRange } from '@livedoc/sheets';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { duplicateColumns, selectedRangeLine } from '@/lib/spreadsheet/clean-up';

const BOX = 'size-icon-row shrink-0 accent-(--office-primary)';
const OPTION = 'flex min-h-row items-center gap-2 text-body pointer-coarse:min-h-11';

export function RemoveDuplicatesDialog({
  range,
  headerText,
  result,
  onRemove,
  onClose,
}: {
  range: GridRange;
  // A column's text in the range's first row, read when "Data has header row" is ticked.
  headerText: (col: number) => string;
  // What the removal found, once it ran.
  result: string | null;
  onRemove: (cols: number[], header: boolean) => void;
  onClose: () => void;
}) {
  const [header, setHeader] = useState(false);
  const columns = duplicateColumns(range, header, headerText);
  const [ticked, setTicked] = useState<ReadonlySet<number>>(
    () => new Set(columns.map((c) => c.col)),
  );
  if (result !== null)
    return (
      <OfficeDialog
        open
        onClose={onClose}
        title="Remove Duplicates"
        primary={{ label: 'OK', onPress: onClose }}
      >
        <p role="status" className="pt-1 text-body">
          {result}
        </p>
      </OfficeDialog>
    );
  const all = ticked.size === columns.length;
  const tick = (col: number, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(col);
    else next.delete(col);
    setTicked(next);
  };
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Remove Duplicates"
      primary={{
        label: 'Remove Duplicates',
        disabled: ticked.size === 0,
        onPress: () =>
          onRemove(
            columns.filter((c) => ticked.has(c.col)).map((c) => c.col),
            header,
          ),
      }}
    >
      <div className="flex flex-col gap-2 pt-1">
        <p className="text-body text-(--office-muted)">{selectedRangeLine(range)}</p>
        <label className={OPTION}>
          <input
            type="checkbox"
            className={BOX}
            checked={header}
            onChange={(e) => setHeader(e.target.checked)}
          />
          Data has header row
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="pb-1 text-body font-medium">Columns to analyse</legend>
          <label className={OPTION}>
            <input
              type="checkbox"
              className={BOX}
              checked={all}
              ref={(el) => {
                if (el) el.indeterminate = !all && ticked.size > 0;
              }}
              onChange={(e) =>
                setTicked(new Set(e.target.checked ? columns.map((c) => c.col) : []))
              }
            />
            Select All
          </label>
          <div className="flex max-h-60 flex-col overflow-y-auto pl-6">
            {columns.map((column) => (
              <label key={column.col} className={OPTION}>
                <input
                  type="checkbox"
                  className={BOX}
                  checked={ticked.has(column.col)}
                  onChange={(e) => tick(column.col, e.target.checked)}
                />
                <span className="truncate">{column.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </OfficeDialog>
  );
}

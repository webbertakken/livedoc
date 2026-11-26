'use client';

// The Named Ranges panel's form (docs/specs/029-sheets/data-tools.md "Named ranges and named functions"): a name and
// the range it covers, on any sheet of the workbook (`Sheet2!A1:B4`). Done names the range, renames it, moves it, or
// both, as one change and one undo step; a name the rules refuse or a range it cannot read says why under its field.
import { useId, useState } from 'react';
import { Button, TextInput } from '@livedoc/ui';
import {
  formatRange,
  namedRangeWrites,
  rangeNameProblem,
  sameName,
  sourceFromText,
  type SheetLayout,
  type WorkbookNamedRange,
} from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { debugLog } from '@/lib/debug-log';

export const RANGE_UNREAD = 'Enter a range, like A1:B4 or Sheet2!A1:B4';

const label = 'block text-supporting text-(--office-muted)';
const error = 'text-supporting text-red-600 dark:text-red-400';

// A layout without the name being changed, so the name may keep its spelling (D297: only the edited one is set aside).
const without = (layout: SheetLayout, name: string): SheetLayout => ({
  ...layout,
  names: layout.names?.filter((x) => !sameName(x.name, name)),
});

export function NamedRangeForm({
  existing,
  onClose,
}: {
  // The name edited; none for a new one over the selection.
  existing: WorkbookNamedRange | undefined;
  onClose: () => void;
}) {
  const c = useSheetController();
  const [name, setName] = useState(existing?.name ?? '');
  // A new name's range is the selection until typed over, so cells picked while the form is open fill it.
  const [typed, setTyped] = useState<string | null>(existing?.text ?? null);
  const range = typed ?? formatRange(c.selection.ranges[c.selection.ranges.length - 1]!);
  const id = useId();
  const [why, setWhy] = useState<{ name?: string; range?: string }>({});
  const refuse = (reason: 'name' | 'range', message: string) => {
    debugLog('[workbook] named range refused', { reason });
    setWhy({ [reason]: message });
  };
  const done = () => {
    const at = sourceFromText(c.workbook.ctxFor(c.sheet.id), range);
    if (!at) return refuse('range', RANGE_UNREAD);
    const { s, ...ids } = at;
    const sheetId = s ?? c.sheet.id;
    const was = existing && { name: existing.name, sheetId: existing.sheetId };
    const layoutOf = (id: string): SheetLayout => {
      const l = (id === c.sheet.id ? c.sheet : c.workbook.sheet(id))?.layout ?? {
        rows: [],
        cols: [],
      };
      return was && was.sheetId === id ? without(l, was.name) : l;
    };
    const others = c.workbook
      .sheetList()
      .filter((x) => x.id !== sheetId)
      .map((x) => layoutOf(x.id));
    const problem = rangeNameProblem(name, layoutOf(sheetId), { others });
    if (problem) return refuse('name', problem);
    const edit = { ...(was ? { was } : {}), name: name.trim(), sheetId, range: ids };
    if (!c.writeAll(namedRangeWrites(edit), 'Name')) return;
    if (was && was.sheetId !== sheetId) debugLog('[workbook] named range moved', {});
    onClose();
  };
  return (
    <form
      className="flex flex-col gap-3"
      aria-label={existing ? `Edit ${existing.name}` : 'Add a Range'}
      onSubmit={(e) => {
        e.preventDefault();
        done();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className={label}>
          Name
        </label>
        <TextInput
          id={`${id}-name`}
          autoFocus
          value={name}
          aria-invalid={!!why.name}
          aria-describedby={why.name ? `${id}-name-why` : undefined}
          onChange={(e) => {
            setWhy({});
            setName(e.target.value);
          }}
        />
        {why.name ? (
          <span id={`${id}-name-why`} className={error} role="alert">
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
          aria-invalid={!!why.range}
          aria-describedby={why.range ? `${id}-range-why` : undefined}
          onChange={(e) => {
            setWhy({});
            setTyped(e.target.value);
          }}
        />
        {why.range ? (
          <span id={`${id}-range-why`} className={error} role="alert">
            {why.range}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="xs">
          Done
        </Button>
      </div>
    </form>
  );
}

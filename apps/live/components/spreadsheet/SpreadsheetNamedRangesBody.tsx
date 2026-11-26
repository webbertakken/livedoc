'use client';

// Data › Named Ranges' side panel (docs/specs/029-sheets/data-tools.md "Named ranges and named functions"), for
// everyone: the workbook's names, each going to its range (opening its sheet); an Editor's rows Edit and Remove, and
// Add a Range under the list. It opens on Add a Range for an Editor when asked (Define Named Range) or when the
// workbook has no names yet (D299).
import { useState } from 'react';
import { PencilIcon, TrashIcon } from '@livedoc/ui';
import type { WorkbookNamedRange } from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { NO_NAMES_READ } from '@/components/sheets/SheetNamedRanges';
import { goToNamed, listedNames } from '@/components/sheets/named-ranges';
import { useSheetNavigation } from '@/components/sheets/sheet-navigation';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { NamedRangeForm } from './NamedRangeForm';

export const NO_NAMES_YET = 'No named ranges yet.';

// What the form is open on: a name (by its sheet and name), a new one, or nothing (the list).
type Editing = { sheetId: string; name: string } | 'new' | null;

const ROW_BUTTON =
  'flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-control text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

export function SpreadsheetNamedRangesBody({
  actions,
  startAdding = false,
}: {
  actions: SheetActions;
  // The cell menu's Define Named Range: Add a Range over the selection, whatever the list holds.
  startAdding?: boolean;
}) {
  const c = useSheetController();
  const open = useSheetNavigation();
  const names = listedNames(c, open);
  const [editing, setEditing] = useState<Editing>(() =>
    c.canShape && (startAdding || names.length === 0) ? 'new' : null,
  );
  const back = () => setEditing(null);
  if (editing) {
    const existing: WorkbookNamedRange | undefined =
      editing === 'new'
        ? undefined
        : names.find((x) => x.sheetId === editing.sheetId && x.name === editing.name);
    return (
      <NamedRangeForm
        key={editing === 'new' ? 'new' : `${editing.sheetId}:${editing.name}`}
        existing={existing}
        onClose={back}
      />
    );
  }
  const remove = (x: WorkbookNamedRange) =>
    c.writeAll(
      [
        {
          sheetId: x.sheetId,
          write: { kind: 'layout', changes: [{ k: 'name', name: x.name, range: null }] },
        },
      ],
      'Name',
    );
  return (
    <>
      {names.length ? (
        <ul className="flex flex-col gap-1" aria-label="Named ranges">
          {names.map((x) => (
            <li
              key={`${x.sheetId}:${x.name}`}
              className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-(--office-hover)"
            >
              <button
                type="button"
                aria-label={`Go To ${x.name}`}
                className="min-w-0 flex-1 cursor-pointer text-left"
                onClick={() => goToNamed(c, actions.goTo, open, x)}
              >
                <span className="block truncate font-mono">{x.name}</span>
                <span className="block truncate text-supporting text-(--office-muted)">
                  {x.text}
                </span>
              </button>
              {c.canShape ? (
                <>
                  <button
                    type="button"
                    aria-label={`Edit ${x.name}`}
                    className={ROW_BUTTON}
                    onClick={() => setEditing({ sheetId: x.sheetId, name: x.name })}
                  >
                    <PencilIcon size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${x.name}`}
                    className={ROW_BUTTON}
                    onClick={() => remove(x)}
                  >
                    <TrashIcon size={16} />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-supporting text-(--office-muted)">
          {c.canShape ? NO_NAMES_YET : NO_NAMES_READ}
        </p>
      )}
      {c.canShape ? (
        <button
          type="button"
          className="mr-auto min-h-row cursor-pointer rounded-control px-1 font-medium text-(--office-primary) hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
          onClick={() => setEditing('new')}
        >
          Add a Range
        </button>
      ) : null}
    </>
  );
}

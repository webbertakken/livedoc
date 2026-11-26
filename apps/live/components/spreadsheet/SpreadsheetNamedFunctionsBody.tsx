'use client';

// Data › Named Functions' side panel (docs/specs/029-sheets/data-tools.md "Named ranges and named functions"), for
// everyone: the workbook's named functions in name order, each its call and description; an Editor's rows Edit and
// Remove, and Add New Function under the list. Each change saves the list whole, one undo step.
import { useState } from 'react';
import { PencilIcon, TrashIcon } from '@livedoc/ui';
import { NamedFunction } from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { track } from '@/lib/telemetry';
import { NamedFunctionForm } from './NamedFunctionForm';
import { useNamedFunctions } from './named-functions-state';

export const NO_FUNCTIONS_READ = 'No named functions.';
export const NO_FUNCTIONS_YET = 'No named functions yet.';

// What the form is open on: a function (by its name), a new one, or nothing (the list).
type Editing = { name: string } | 'new' | null;

const ROW_BUTTON =
  'flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-control text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

export function SpreadsheetNamedFunctionsBody() {
  const c = useSheetController();
  const { functions, save } = useNamedFunctions();
  const listed = NamedFunction.sorted(functions);
  const [editing, setEditing] = useState<Editing>(null);
  const back = () => setEditing(null);
  if (editing && c.canShape) {
    const existing = editing === 'new' ? undefined : NamedFunction.find(functions, editing.name);
    return (
      <NamedFunctionForm
        key={editing === 'new' ? 'new' : editing.name}
        existing={existing}
        others={existing ? NamedFunction.without(functions, existing.name) : functions}
        onSave={(fn) => save(NamedFunction.put(functions, fn, existing?.name))}
        onClose={back}
      />
    );
  }
  const remove = (fn: NamedFunction) => {
    track('Spreadsheet', 'Changed', 'NamedFunction');
    void save(NamedFunction.without(functions, fn.name));
  };
  return (
    <>
      {listed.length ? (
        <ul className="flex flex-col gap-1" aria-label="Named functions">
          {listed.map((fn) => (
            <li
              key={fn.name}
              className="flex items-start gap-2 rounded-control px-1 py-1 hover:bg-(--office-hover)"
            >
              <div className="min-w-0 flex-1">
                <span className="block font-mono break-words">{NamedFunction.callText(fn)}</span>
                {fn.description ? (
                  <span className="block text-supporting text-(--office-muted)">
                    {fn.description}
                  </span>
                ) : null}
              </div>
              {c.canShape ? (
                <>
                  <button
                    type="button"
                    aria-label={`Edit ${fn.name}`}
                    className={ROW_BUTTON}
                    onClick={() => setEditing({ name: fn.name })}
                  >
                    <PencilIcon size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${fn.name}`}
                    className={ROW_BUTTON}
                    onClick={() => remove(fn)}
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
          {c.canShape ? NO_FUNCTIONS_YET : NO_FUNCTIONS_READ}
        </p>
      )}
      {c.canShape ? (
        <button
          type="button"
          className="mr-auto min-h-row cursor-pointer rounded-control px-1 font-medium text-(--office-primary) hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
          onClick={() => setEditing('new')}
        >
          Add New Function
        </button>
      ) : null}
    </>
  );
}

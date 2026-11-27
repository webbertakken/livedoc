'use client';

// Data › Named Functions › Import Function (docs/specs/029-sheets/data-tools.md "Named ranges and named functions"): a
// picker of the person's other spreadsheets, then the one picked's named functions, each ticked to import, with Import
// All; a function calling one of them left behind says so beside it. Loading, none and a failed read each say so.
import { useEffect, useId, useState } from 'react';
import { Button } from '@livedoc/ui';
import { NamedFunction, callsLeftBehind, type FunctionSource } from '@livedoc/sheets';
import { Dialog } from '@/components/dialogs/Dialog';
import { DialogFooter } from '@/components/dialogs/DialogFooter';
import { apiFunctionSource } from '@/lib/api/workbook';
import { debugLog } from '@/lib/debug-log';
import { SpreadsheetPickList } from './SpreadsheetPickList';

const TITLE_ID = 'import-function-title';

type Picked = { documentId: string; name: string };
type Reading =
  { state: 'loading' } | { state: 'failed' } | { state: 'ready'; source: FunctionSource };

// The picked spreadsheet's named functions, read once (again on a retry); a late answer after a change is dropped.
function useFunctionSource(ownerId: string, documentId: string) {
  const [reading, setReading] = useState<Reading>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    apiFunctionSource(ownerId, documentId).then(
      (source) => {
        if (live) setReading({ state: 'ready', source });
      },
      (error: unknown) => {
        debugLog('[workbook] import function source failed', { error: String(error) });
        if (live) setReading({ state: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [ownerId, documentId, attempt]);
  const retry = () => {
    setReading({ state: 'loading' });
    setAttempt((n) => n + 1);
  };
  return { reading, retry };
}

function FunctionChoice({
  ownerId,
  picked,
  here,
  onImport,
  onBack,
}: {
  ownerId: string;
  picked: Picked;
  here: readonly NamedFunction[];
  onImport: (functions: readonly NamedFunction[], source: FunctionSource) => void;
  onBack: () => void;
}) {
  const id = useId();
  const { reading, retry } = useFunctionSource(ownerId, picked.documentId);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const listed = reading.state === 'ready' ? NamedFunction.sorted(reading.source.functions) : [];
  const chosen = listed.filter((fn) => ticked.has(fn.name));
  const toggle = (name: string) =>
    setTicked((was) => {
      const next = new Set(was);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  const message = 'text-body text-slate-600 dark:text-slate-300';
  return (
    <>
      <div className="flex flex-col gap-3 px-6 pt-6 pb-4">
        <h2 id={TITLE_ID} className="text-dialog-title text-slate-900 dark:text-slate-50">
          Import from {picked.name}
        </h2>
        {reading.state === 'loading' ? (
          <p role="status" className={message}>
            Loading its named functions…
          </p>
        ) : reading.state === 'failed' ? (
          <div
            role="alert"
            className="flex items-center gap-3 text-body text-slate-700 dark:text-slate-200"
          >
            <span>Its named functions could not be read.</span>
            <Button variant="secondary" size="xs" onClick={retry}>
              Try Again
            </Button>
          </div>
        ) : listed.length === 0 ? (
          <p className={message}>That spreadsheet has no named functions.</p>
        ) : (
          <ul
            aria-label="Its named functions"
            className="flex max-h-80 flex-col gap-1 overflow-y-auto"
          >
            {listed.map((fn, i) => {
              const behind = ticked.has(fn.name)
                ? callsLeftBehind(fn, reading.source.functions, chosen, here)
                : [];
              const box = `${id}-fn-${i}`;
              return (
                <li key={fn.name} className="flex items-start gap-2 px-1 py-1">
                  <input
                    id={box}
                    type="checkbox"
                    checked={ticked.has(fn.name)}
                    onChange={() => toggle(fn.name)}
                    className="mt-1 size-icon-row shrink-0 accent-(--office-primary)"
                  />
                  <label htmlFor={box} className="min-w-0 flex-1 text-body">
                    <span className="block font-mono break-words text-slate-800 dark:text-slate-100">
                      {NamedFunction.callText(fn)}
                    </span>
                    {fn.description ? (
                      <span className="block text-supporting text-slate-600 dark:text-slate-300">
                        {fn.description}
                      </span>
                    ) : null}
                  </label>
                  {behind.length ? (
                    <span className="max-w-40 text-supporting text-amber-800 dark:text-amber-300">
                      Calls {behind.join(', ')}, which {behind.length > 1 ? 'are' : 'is'} not
                      imported
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <DialogFooter>
        <Button variant="secondary" className="mr-auto" onClick={onBack}>
          Back
        </Button>
        {reading.state === 'ready' && listed.length ? (
          <>
            <Button variant="secondary" onClick={() => onImport(listed, reading.source)}>
              Import All
            </Button>
            <Button disabled={!chosen.length} onClick={() => onImport(chosen, reading.source)}>
              Import
            </Button>
          </>
        ) : null}
      </DialogFooter>
    </>
  );
}

export function ImportFunctionDialog({
  ownerId,
  currentId,
  here,
  onImport,
  onClose,
}: {
  ownerId: string;
  currentId: string;
  // The named functions here.
  here: readonly NamedFunction[];
  onImport: (functions: readonly NamedFunction[], source: FunctionSource) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  return (
    <Dialog open onClose={onClose} titleId={TITLE_ID}>
      {picked ? (
        <FunctionChoice
          key={picked.documentId}
          ownerId={ownerId}
          picked={picked}
          here={here}
          onImport={onImport}
          onBack={() => setPicked(null)}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 px-6 pt-6 pb-4">
            <h2 id={TITLE_ID} className="text-dialog-title text-slate-900 dark:text-slate-50">
              Import named functions from
            </h2>
            <SpreadsheetPickList
              ownerId={ownerId}
              currentId={currentId}
              what="workbook import function"
              onPick={setPicked}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}

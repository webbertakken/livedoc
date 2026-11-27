'use client';

// Edit › Find and Replace (docs/specs/029-sheets/data-tools.md "Find and replace"): Find, Replace With, Search (All
// Sheets, This Sheet, Specific Range), the five options, and Find, Replace, Replace All and Done, Google's dialog in
// the shell's look. A Viewer's has Find and Done only; the line under the options says what the last press did.
import { useEffect, useId, useMemo } from 'react';
import { ChevronDownIcon, TextInput } from '@livedoc/ui';
import { findMatches, findPattern, type FindOptions } from '@livedoc/sheets';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { FindReplaceState, FindSearch } from './find-replace-state';
import { useFindReplaceRun } from './useFindReplaceRun';

const SELECT =
  'h-field w-full min-w-0 cursor-pointer appearance-none truncate rounded-control border border-(--office-line) bg-transparent pr-6 pl-3 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) [&>option]:bg-(--office-menu)';
const BOX = 'size-icon-row shrink-0 accent-(--office-primary)';
const OPTION = 'flex min-h-row items-center gap-2 text-body pointer-coarse:min-h-11';
const LABEL = 'w-28 shrink-0 text-body text-(--office-muted) max-sm:w-full';
const PILL =
  'touch-target relative inline-flex h-prominent cursor-pointer items-center rounded-full px-6 text-body outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) disabled:cursor-default disabled:opacity-40';
const FIND_HIGHLIGHTS_MAX = 2_000;

const SEARCHES: readonly { value: FindSearch; label: string }[] = [
  { value: 'all', label: 'All Sheets' },
  { value: 'sheet', label: 'This Sheet' },
  { value: 'range', label: 'Specific Range' },
];

const OPTIONS: readonly { key: keyof FindOptions; label: string }[] = [
  { key: 'matchCase', label: 'Match Case' },
  { key: 'entireCell', label: 'Match Entire Cell Contents' },
  { key: 'regex', label: 'Search Using Regular Expressions' },
  { key: 'inFormulas', label: 'Also Search Within Formulas' },
  { key: 'inLinks', label: 'Also Search Within Links' },
];

export function FindReplaceDialog({ state }: { state: FindReplaceState }) {
  const c = useSheetController();
  const run = useFindReplaceRun(state);
  const id = useId();
  const { fields, change } = state;
  const writes = c.canEdit;
  const empty = fields.find === '';
  const blocked = empty || run.problem !== null;
  // This sheet's matches are highlighted while the dialog is open, as the Find bar's are.
  const pattern = useMemo(() => findPattern(fields.find, fields.opts), [fields.find, fields.opts]);
  const { setFindHits } = c;
  const hits = useMemo(
    () =>
      pattern && !('refused' in pattern)
        ? findMatches(c.workbook, { sheetId: c.sheet.id }, pattern).slice(0, FIND_HIGHLIGHTS_MAX)
        : [],
    [c.workbook, c.sheet.id, pattern, c.version], // oxlint-disable-line react/exhaustive-deps
  );
  useEffect(() => setFindHits(hits), [hits, setFindHits]);
  useEffect(() => () => setFindHits([]), [setFindHits]);
  const close = () => {
    state.close();
    c.focusGrid();
  };
  const line = run.problem ?? state.status;
  return (
    <OfficeDialog open onClose={close} title="Find and Replace">
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label htmlFor={`${id}-find`} className={LABEL}>
            Find
          </label>
          <TextInput
            id={`${id}-find`}
            className="min-w-0 flex-1"
            value={fields.find}
            aria-invalid={run.problem === line && !!run.problem}
            aria-describedby={`${id}-line`}
            onChange={(e) => change({ find: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (!blocked) run.find();
            }}
          />
        </div>
        {writes ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label htmlFor={`${id}-by`} className={LABEL}>
              Replace With
            </label>
            <TextInput
              id={`${id}-by`}
              className="min-w-0 flex-1"
              value={fields.by}
              onChange={(e) => change({ by: e.target.value })}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label htmlFor={`${id}-search`} className={LABEL}>
            Search
          </label>
          <span className="relative inline-flex min-w-0 flex-1">
            <select
              id={`${id}-search`}
              className={SELECT}
              value={fields.search}
              onChange={(e) => change({ search: e.target.value as FindSearch })}
            >
              {SEARCHES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
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
        </div>
        {fields.search === 'range' ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label htmlFor={`${id}-range`} className={LABEL}>
              Range
            </label>
            <TextInput
              id={`${id}-range`}
              className="min-w-0 flex-1"
              value={fields.range ?? run.selectionText}
              onChange={(e) => change({ range: e.target.value })}
            />
          </div>
        ) : null}
        <fieldset className="flex flex-col">
          <legend className="sr-only">Options</legend>
          {OPTIONS.map((o) => (
            <label key={o.key} className={OPTION}>
              <input
                type="checkbox"
                className={BOX}
                checked={!!fields.opts[o.key]}
                onChange={(e) => change({ opts: { ...fields.opts, [o.key]: e.target.checked } })}
              />
              {o.label}
            </label>
          ))}
        </fieldset>
        <p
          id={`${id}-line`}
          aria-live="polite"
          className={`min-h-row text-supporting ${run.problem ? 'text-red-600 dark:text-red-400' : 'text-(--office-muted)'}`}
        >
          {line}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${PILL} border border-(--office-line) text-(--office-primary) hover:bg-(--office-hover)`}
            disabled={blocked}
            onClick={run.find}
          >
            Find
          </button>
          {writes ? (
            <>
              <button
                type="button"
                className={`${PILL} border border-(--office-line) text-(--office-primary) hover:bg-(--office-hover)`}
                disabled={blocked}
                onClick={run.replace}
              >
                Replace
              </button>
              <button
                type="button"
                className={`${PILL} border border-(--office-line) text-(--office-primary) hover:bg-(--office-hover)`}
                disabled={blocked}
                onClick={run.replaceAll}
              >
                Replace All
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={`${PILL} ml-auto bg-(--office-primary) font-medium text-(--office-primary-ink)`}
            onClick={close}
          >
            Done
          </button>
        </div>
      </div>
    </OfficeDialog>
  );
}

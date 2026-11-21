'use client';

// The Line numbers side panel's body (docs/specs/034-text-documents/page-layout.md "Line numbers", "The panel"): Show
// line numbers, the three restarts (dimmed while off) and Apply to (dimmed with one section), for the caret's section.
// A choice applies at once over the scope Apply to names; choosing Apply to changes nothing until the next choice.
import { useId, useState } from 'react';
import type { LineNumberRestart } from '@livedoc/text-documents';
import {
  DEFAULT_LINE_NUMBER_RESTART,
  LINE_NUMBER_RESTART_LABELS,
  LINE_NUMBERS_SCOPE_LABELS,
  type LineNumbersChoice,
  type LineNumbersScope,
} from '@/lib/text-document/text-document-line-numbers';
import type { LineNumbersState } from './useTextDocumentLineNumbers';

const CHOICE = 'size-4 shrink-0 accent-(--office-primary) disabled:cursor-default';
const HEADING = 'mb-2 text-sm font-medium';
const ROW =
  'flex cursor-pointer items-center gap-3 text-sm has-disabled:cursor-default has-disabled:opacity-40';
const SELECT =
  'h-9 w-full cursor-pointer rounded border border-(--office-line) bg-transparent px-3 text-sm text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) disabled:cursor-default disabled:opacity-40 [&>option]:bg-(--office-menu)';

const RESTARTS: readonly LineNumberRestart[] = ['continuous', 'page', 'section'];
const SCOPES: readonly LineNumbersScope[] = ['document', 'section'];

export function TextDocumentLineNumbersPanel({
  state,
  onChoose,
}: {
  state: LineNumbersState;
  onChoose: (choice: Omit<LineNumbersChoice, 'section'>) => void;
}) {
  const ids = { restart: useId(), scope: useId() };
  const [scope, setScope] = useState<LineNumbersScope>('document');
  const own = state.own[state.section];
  const shown = own !== undefined;
  const restart = own?.restart ?? DEFAULT_LINE_NUMBER_RESTART;
  const single = state.own.length < 2;
  const applied = single ? 'document' : scope;

  return (
    <div className="flex flex-col gap-6 px-2 pt-1">
      <label className={ROW}>
        <input
          type="checkbox"
          className={CHOICE}
          checked={shown}
          onChange={(e) => onChoose({ scope: applied, shown: e.target.checked, restart })}
        />
        Show line numbers
      </label>
      <fieldset disabled={!shown} aria-label="Numbering">
        <div className="flex flex-col gap-3">
          {RESTARTS.map((choice) => (
            <label key={choice} className={ROW}>
              <input
                type="radio"
                name={ids.restart}
                className={CHOICE}
                checked={restart === choice}
                onChange={() => onChoose({ scope: applied, shown: true, restart: choice })}
              />
              {LINE_NUMBER_RESTART_LABELS[choice]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col">
        <label htmlFor={ids.scope} className={HEADING}>
          Apply to
        </label>
        <select
          id={ids.scope}
          value={applied}
          disabled={single}
          onChange={(e) => setScope(e.target.value as LineNumbersScope)}
          className={SELECT}
        >
          {SCOPES.map((choice) => (
            <option key={choice} value={choice}>
              {LINE_NUMBERS_SCOPE_LABELS[choice]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

'use client';

// Insert > Page numbers > More options, Format > Page numbers and the bar's Page numbers (docs/specs/034-text-documents/
// page-layout.md "Page numbers"): where the numbers go, whether the first page shows one, where numbering starts, and
// Apply to while there are sections; nothing changes until Apply.
import { useId, useState } from 'react';
import type { HeaderFooterKind } from '@livedoc/text-documents';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import type { PageNumberScope } from '@/lib/text-document/text-document-page-numbers';

/** The most Start at takes (default). */
export const PAGE_NUMBER_START_MAX = 9999;
export const START_OUT_OF_RANGE = `Enter a number from 0 to ${PAGE_NUMBER_START_MAX}.`;

export const PAGE_NUMBER_SCOPE_LABELS: Record<PageNumberScope, string> = {
  section: 'This section',
  document: 'Whole document',
};

/** What Apply gives: `start` null continues from the previous section. */
export type PageNumberOptions = {
  readonly position: HeaderFooterKind;
  readonly firstPage: boolean;
  readonly start: number | null;
};

const CONTROL =
  'h-prominent rounded-control border border-(--office-line) bg-transparent px-3 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';
const FIELD = `${CONTROL} w-24 tabular-nums aria-[invalid=true]:border-red-600 dark:aria-[invalid=true]:border-red-400 disabled:opacity-40`;
const HEADING = 'mb-2 text-body font-medium';
const CHOICE = 'size-4 shrink-0 accent-(--office-primary)';

/** Start at as typed: a whole number from 0 to the most, else null. */
export function readStart(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= PAGE_NUMBER_START_MAX ? value : null;
}

export function TextDocumentPageNumbersDialog({
  open,
  start,
  scopes,
  onApply,
  onClose,
}: {
  open: boolean;
  // The section's start now: a number, or none (continue).
  start: number | undefined;
  // What Apply to offers; This section first, chosen when it opens. One choice offers none.
  scopes: readonly PageNumberScope[];
  onApply: (options: PageNumberOptions, scope: PageNumberScope) => void;
  onClose: () => void;
}) {
  const ids = {
    position: useId(),
    numbering: useId(),
    start: useId(),
    error: useId(),
    scope: useId(),
  };
  const [position, setPosition] = useState<HeaderFooterKind>('header');
  const [firstPage, setFirstPage] = useState(true);
  const [continues, setContinues] = useState(start === undefined);
  const [startText, setStartText] = useState(String(start ?? 1));
  const [scope, setScope] = useState<PageNumberScope>(scopes[0] ?? 'section');
  const typed = readStart(startText);
  const invalid = !continues && typed === null;

  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Page numbers"
      primary={{
        label: 'Apply',
        disabled: invalid,
        onPress: () => onApply({ position, firstPage, start: continues ? null : typed }, scope),
      }}
    >
      <div className="flex flex-col gap-6 pt-1">
        <fieldset>
          <legend className={HEADING}>Position</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(['header', 'footer'] as const).map((kind) => (
              <label key={kind} className="flex cursor-pointer items-center gap-2 text-body">
                <input
                  type="radio"
                  name={ids.position}
                  className={CHOICE}
                  checked={position === kind}
                  onChange={() => setPosition(kind)}
                />
                {kind === 'header' ? 'Header' : 'Footer'}
              </label>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-3 text-body">
            <input
              type="checkbox"
              className={CHOICE}
              checked={firstPage}
              onChange={(e) => setFirstPage(e.target.checked)}
            />
            Show on first page
          </label>
        </fieldset>
        <fieldset>
          <legend className={HEADING}>Numbering</legend>
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-body">
              <input
                type="radio"
                name={ids.numbering}
                className={CHOICE}
                checked={continues}
                onChange={() => setContinues(true)}
              />
              Continue from previous section
            </label>
            <div className="flex flex-wrap items-center gap-2 text-body">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={ids.numbering}
                  className={CHOICE}
                  checked={!continues}
                  onChange={() => setContinues(false)}
                />
                Start at
              </label>
              <input
                id={ids.start}
                type="text"
                inputMode="numeric"
                aria-label="Start at"
                aria-invalid={invalid}
                aria-describedby={invalid ? ids.error : undefined}
                disabled={continues}
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                className={FIELD}
              />
            </div>
            {invalid ? (
              <span id={ids.error} className="text-supporting text-red-700 dark:text-red-300">
                {START_OUT_OF_RANGE}
              </span>
            ) : null}
          </div>
        </fieldset>
        {scopes.length > 1 ? (
          <div className="flex flex-col">
            <label htmlFor={ids.scope} className={HEADING}>
              Apply to
            </label>
            <select
              id={ids.scope}
              value={scope}
              onChange={(e) => setScope(e.target.value as PageNumberScope)}
              className={`${CONTROL} w-full max-w-64 cursor-pointer [&>option]:bg-(--office-menu)`}
            >
              {scopes.map((choice) => (
                <option key={choice} value={choice}>
                  {PAGE_NUMBER_SCOPE_LABELS[choice]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </OfficeDialog>
  );
}

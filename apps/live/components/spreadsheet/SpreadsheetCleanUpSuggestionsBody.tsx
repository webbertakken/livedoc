'use client';

// Data › Data Clean-up › Clean-up Suggestions (docs/specs/029-sheets/data-tools.md "Clean-up Suggestions"): a card for
// each kind found over the open sheet's used range, with Apply and a × that sets it aside until the panel opens again;
// a link to Column Stats at its foot. An Editor's; it follows edits as they land.
import { useEffect, useMemo, useRef, useState } from 'react';
import { cleanUpSuggestions, type CleanUpSuggestion } from '@livedoc/sheets';
import { CloseIcon } from '@livedoc/ui';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { NO_SUGGESTIONS, suggestionLine, suggestionTitle } from '@/lib/spreadsheet/clean-up-panels';

const LINK =
  'mr-auto min-h-row cursor-pointer rounded-control px-1 text-body font-medium text-(--office-primary) hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

const keyOf = (s: CleanUpSuggestion) => (s.kind === 'textNumbers' ? `${s.kind}:${s.col}` : s.kind);

export function SpreadsheetCleanUpSuggestionsBody({
  onColumnStats,
}: {
  onColumnStats: () => void;
}) {
  const c = useSheetController();
  const { sheet, workbook } = c;
  const [aside, setAside] = useState<ReadonlySet<string>>(new Set());
  const found = useMemo(
    // The sheet in the deps: the suggestions follow each change of it.
    () => (sheet ? cleanUpSuggestions(workbook, sheet.id) : []),
    [workbook, sheet],
  );
  const shown = found.filter((s) => !aside.has(keyOf(s)));
  const sheetId = sheet.id;
  // Once as it opens on a sheet, not per edit: what it found, by kind.
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (logged.current === sheetId) return;
    logged.current = sheetId;
    const counts: Record<string, number> = {};
    for (const s of found) counts[s.kind] = (counts[s.kind] ?? 0) + s.count;
    debugLog('[sheet] clean-up suggested', counts);
  }, [sheetId, found]);
  const apply = (s: CleanUpSuggestion) => {
    if (!c.write(s.write, 'Cleanup'))
      return debugLog('[sheet] clean-up refused', { tool: s.kind, reason: 'protected' });
    debugLog('[sheet] clean-up applied', { kind: s.kind, count: s.count });
    track('Spreadsheet', 'Changed', 'Cleanup');
  };
  return (
    <div className="flex flex-col gap-3">
      {shown.length === 0 ? (
        <p className="text-(--office-muted)">{NO_SUGGESTIONS}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((s) => (
            <li
              key={keyOf(s)}
              className="flex flex-col gap-2 rounded-control border border-(--office-line) p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{suggestionTitle(s)}</p>
                  <p className="text-(--office-muted)">{suggestionLine(s)}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Set aside: ${suggestionTitle(s)}`}
                  className="flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-full text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
                  onClick={() => setAside(new Set([...aside, keyOf(s)]))}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              <button
                type="button"
                className="ml-auto min-h-row cursor-pointer rounded-full px-4 font-medium text-(--office-primary) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
                onClick={() => apply(s)}
              >
                Apply
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={LINK} onClick={onColumnStats}>
        Column Stats
      </button>
    </div>
  );
}

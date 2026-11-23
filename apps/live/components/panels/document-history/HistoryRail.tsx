'use client';

// History's rail (docs/specs/013-workspace/timeline.md §2.10): one ordered list per local day, under
// a sticky heading with the day's count, each day an ordered list of entries.

import type { HistoryDay } from '@livedoc/ui';
import { HistoryEntry } from './HistoryEntry';
import { INSET, MUTED } from './history-styles';

export function HistoryRail({
  days,
  viewerId,
  idPrefix,
}: {
  days: HistoryDay[];
  viewerId: string;
  // Makes each day heading's id unique to this dialog.
  idPrefix: string;
}) {
  return (
    <ol aria-label="Events, newest first" className="pb-2">
      {days.map((day) => {
        const headingId = `${idPrefix}-${day.key}`;
        return (
          <li key={day.key} aria-labelledby={headingId}>
            <h3
              id={headingId}
              className={`sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-slate-100 bg-white/90 py-2 text-supporting text-slate-700 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 ${INSET}`}
            >
              <time dateTime={day.key}>{day.label}</time>
              <span className={`font-normal ${MUTED}`}>
                {day.count === 1 ? '1 event' : `${day.count} events`}
              </span>
            </h3>
            <ol className={`relative pt-3 pb-1 ${INSET}`}>
              {day.runs.map((run, i) => (
                <HistoryEntry
                  key={run.key}
                  run={run}
                  viewerId={viewerId}
                  last={i === day.runs.length - 1}
                />
              ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}

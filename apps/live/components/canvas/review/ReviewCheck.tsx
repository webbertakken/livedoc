'use client';

import type { ElementId } from '@livedoc/document';
import {
  formatReadiness,
  readinessOf,
  type StormGap,
  type StormReading,
} from '@livedoc/storm-reading';
import { checkGroups } from '@/lib/review-rows';
import {
  KindSwatch,
  REVIEW_HEADING,
  REVIEW_MUTED,
  REVIEW_ROW,
  ReviewEmpty,
  RowAct,
} from './review-parts';

// The Check tab (docs/specs/021-event-storming/board-review.md "Readiness", "Check"): the readiness line, then the
// gaps the reading finds, grouped by level. Pointing at a row or focusing it rings its notes and brings them into
// view; Add lands the note that would close the gap, Answer opens an open hotspot's answer. A gap is a prompt,
// never a verdict: nothing is drawn on a note because of one.

export function ReviewCheck({
  reading,
  mayWrite,
  onRing,
  onAdd,
  onAnswer,
}: {
  reading: StormReading;
  // Whether Add and Answer are offered: an Editor's alone.
  mayWrite: boolean;
  // Ring these notes and bring them into view; none lets go.
  onRing: (ids: readonly ElementId[]) => void;
  onAdd: (gap: StormGap) => void;
  onAnswer: (hotspotId: ElementId) => void;
}) {
  const groups = checkGroups(reading);
  return (
    <>
      <p
        role="status"
        className="border-b border-slate-200 px-4 py-2.5 text-supporting text-slate-700 dark:border-slate-800 dark:text-slate-300"
      >
        {formatReadiness(readinessOf(reading))}
      </p>
      {groups.length === 0 ? (
        <ReviewEmpty>Nothing to check. The story holds.</ReviewEmpty>
      ) : (
        <div className="pb-2">
          {groups.map((group) => (
            <section key={group.level} aria-label={group.title}>
              <h3 className={REVIEW_HEADING}>{group.title}</h3>
              <ul>
                {group.rows.map((row) => (
                  <li
                    key={row.id}
                    tabIndex={0}
                    data-review-gap={row.gap.code}
                    onPointerEnter={() => onRing(row.gap.ids)}
                    onPointerLeave={() => onRing([])}
                    onFocus={() => onRing(row.gap.ids)}
                    onBlur={() => onRing([])}
                    className={`flex items-center gap-3 px-3 py-1.5 ${REVIEW_ROW}`}
                  >
                    <span className="mt-1.5 self-start">
                      <KindSwatch kind={row.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-body text-slate-900 dark:text-slate-100">
                        {row.words}
                      </span>
                      <span className={`block ${REVIEW_MUTED}`}>{row.says}</span>
                    </span>
                    {mayWrite && row.act?.type === 'add' ? (
                      <RowAct
                        aria-label={row.act.label}
                        lead={<KindSwatch kind={row.act.kind} size={8} />}
                        onClick={() => onAdd(row.gap)}
                      >
                        Add
                      </RowAct>
                    ) : null}
                    {mayWrite && row.act?.type === 'answer' ? (
                      <RowAct aria-label={row.act.label} onClick={() => onAnswer(row.gap.ids[0]!)}>
                        Answer
                      </RowAct>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

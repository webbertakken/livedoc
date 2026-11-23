'use client';

// One entry on History's rail (docs/specs/013-workspace/timeline.md §2.10): an event, or a run of
// one type by one person folded into one. Its glyph in a disc in its tone, the reason in words, who
// did it, the detail, any words to quote and the time. A run says how many times and deals itself
// out on Show all.

import { memo, useId, useState } from 'react';
import {
  eventTone,
  pickRenderer,
  timeLabel,
  toneColor,
  toneSoftColor,
  type HistoryRun,
  type TimelineEvent,
} from '@livedoc/ui';
import { ChevronIcon } from '@/components/primitives/ChevronIcon';
import { TIMELINE_RENDERERS } from '@/app/explorer/timeline/renderers';
import { track } from '@/lib/telemetry';
import { eventPersonKey } from '@/app/explorer/timeline/event-person';
import { HistoryPerson } from './HistoryPerson';
import { historyWords } from './history-words';
import { HISTORY_LINK, MUTED, isoInstant } from './history-styles';

function wordsFor(event: TimelineEvent, viewerId: string) {
  const card = pickRenderer(event, TIMELINE_RENDERERS)(event, { viewerId });
  return { card, words: historyWords(event, card, viewerId) };
}

function Time({ at }: { at: number }) {
  return <time dateTime={isoInstant(at)}>{timeLabel(at)}</time>;
}

export const HistoryEntry = memo(function HistoryEntry({
  run,
  viewerId,
  last,
}: {
  run: HistoryRun;
  viewerId: string;
  // The last entry of its day draws no rail below its disc.
  last: boolean;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const event = run.events[0]!;
  const many = run.events.length;
  const { card, words } = wordsFor(event, viewerId);
  const tone = eventTone(event.eventType);
  // A run's detail and words differ per member, so they wait for Show all.
  const detail = many > 1 ? null : words.detail;
  const quote = many > 1 ? null : words.quote;
  return (
    <li data-history-entry={event.eventType} className="relative flex gap-3 pb-4">
      {last ? null : (
        <span
          aria-hidden
          className="absolute top-8 bottom-0 left-4 w-px bg-slate-200 dark:bg-slate-700/70"
        />
      )}
      <span
        aria-hidden
        className="relative z-[1] size-field shrink-0 rounded-full bg-white ring-4 ring-white dark:bg-slate-900 dark:ring-slate-900"
      >
        <span
          className="flex h-full w-full items-center justify-center rounded-full"
          style={{ background: toneSoftColor(tone), color: toneColor(tone) }}
        >
          {card.icon}
        </span>
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 text-body text-slate-900 dark:text-slate-100">
            {words.label}
            {many > 1 ? (
              <span className="ml-1 inline-flex items-center rounded-full bg-slate-100 px-2 align-[1px] text-supporting text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {many} times
              </span>
            ) : null}
          </p>
          <span className={`shrink-0 text-supporting tabular-nums ${MUTED}`}>
            {many > 1 ? (
              <>
                <Time at={run.events[many - 1]!.occurredAt} />
                {'–'}
                <Time at={event.occurredAt} />
              </>
            ) : (
              <Time at={event.occurredAt} />
            )}
          </span>
        </div>
        {words.who || detail ? (
          <p className={`mt-0.5 flex min-w-0 items-center gap-1 text-supporting ${MUTED}`}>
            {words.who ? (
              <HistoryPerson
                name={words.who}
                colourKey={eventPersonKey(event, viewerId) ?? words.who}
                mine={event.actorId === viewerId}
                size={16}
              />
            ) : null}
            <span className="truncate">
              {words.who ? (
                <span className="font-medium text-slate-700 dark:text-slate-200">{words.who}</span>
              ) : null}
              {words.who && detail ? ' · ' : ''}
              {detail}
            </span>
          </p>
        ) : null}
        {quote ? (
          <blockquote className="mt-1.5 line-clamp-3 rounded-control border-l-2 border-slate-200 bg-slate-50 px-3 py-1.5 text-supporting text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
            {quote}
          </blockquote>
        ) : null}
        {many > 1 ? (
          <>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => {
                if (!open) track('Timeline', 'Opened', 'Run');
                setOpen((o) => !o);
              }}
              className={`mt-1 ${HISTORY_LINK}`}
            >
              {open ? 'Hide' : `Show all ${many}`}
              <ChevronIcon open={open} />
            </button>
            {open ? (
              <ol
                id={listId}
                aria-label={`${typeof words.label === 'string' ? words.label : event.title}, ${many} times`}
                className="mt-1.5 flex flex-col gap-1 border-l border-slate-200 pl-3 motion-safe:animate-fade-in dark:border-slate-700"
              >
                {run.events.map((e) => (
                  <RunMember key={e.id} event={e} viewerId={viewerId} />
                ))}
              </ol>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
});

function RunMember({ event, viewerId }: { event: TimelineEvent; viewerId: string }) {
  const { words } = wordsFor(event, viewerId);
  return (
    <li className="flex items-baseline gap-2 text-supporting">
      <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
        {words.detail ?? words.quote ?? words.label}
      </span>
      <span className={`shrink-0 tabular-nums ${MUTED}`}>
        <Time at={event.occurredAt} />
      </span>
    </li>
  );
}

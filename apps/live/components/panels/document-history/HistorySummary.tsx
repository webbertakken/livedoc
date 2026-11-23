'use client';

// History at a glance (docs/specs/013-workspace/timeline.md §2.10): when the document was made,
// when it last changed, who took part and how many events are loaded.

import type { TimelineEvent } from '@livedoc/ui';
import { eventCountLabel, relativeSince } from '@livedoc/ui';
import { eventPersonKey, eventPersonName } from '@/app/explorer/timeline/event-person';
import { HistoryPerson } from './HistoryPerson';
import { INSET, MUTED, isoInstant } from './history-styles';

// The strip overlaps at most this many avatars beside the count.
const AVATARS_SHOWN = 3;

const fullDate = (at: number) =>
  new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const STAT = 'flex min-w-0 flex-col gap-0.5';
const TERM = `text-supporting ${MUTED}`;
const VALUE = 'truncate text-body text-slate-800 dark:text-slate-100';

export function HistorySummary({
  createdAt,
  changedAt,
  now,
  count,
  more,
  people,
  viewerId,
}: {
  createdAt: number | null;
  changedAt: number | null;
  now: number;
  count: number;
  more: boolean;
  people: TimelineEvent[];
  viewerId: string;
}) {
  return (
    <dl
      data-history-summary=""
      className={`grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-100 bg-slate-50/70 py-3 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800/40 ${INSET}`}
    >
      {createdAt !== null ? (
        <div className={STAT}>
          <dt className={TERM}>Created</dt>
          <dd className={VALUE}>
            <time dateTime={isoInstant(createdAt)}>{fullDate(createdAt)}</time>
          </dd>
        </div>
      ) : null}
      {changedAt !== null ? (
        <div className={STAT}>
          <dt className={TERM}>Last changed</dt>
          <dd className={VALUE}>
            <time dateTime={isoInstant(changedAt)}>{relativeSince(changedAt, now)}</time>
          </dd>
        </div>
      ) : null}
      <div className={STAT}>
        <dt className={TERM}>People</dt>
        <dd className={`flex items-center gap-1 ${VALUE}`}>
          {people.length > 0 ? (
            <span className="flex -space-x-1" aria-hidden>
              {people.slice(0, AVATARS_SHOWN).map((e) => (
                <HistoryPerson
                  key={e.id}
                  name={eventPersonName(e, viewerId) ?? 'Someone'}
                  colourKey={eventPersonKey(e, viewerId) ?? e.id}
                  mine={e.actorId === viewerId}
                  size={22}
                  ring
                />
              ))}
            </span>
          ) : null}
          <span>
            {people.length}
            {more ? '+' : ''}
          </span>
        </dd>
      </div>
      <div className={STAT}>
        <dt className={TERM}>Events</dt>
        <dd className={VALUE}>{eventCountLabel(count, more)}</dd>
      </div>
    </dl>
  );
}

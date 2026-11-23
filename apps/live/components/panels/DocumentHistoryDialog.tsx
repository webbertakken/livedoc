'use client';

// One document's History, from its menu (docs/specs/013-workspace/timeline.md §2.10).
//
// A dialog rather than a page, because "what happened to this?" is asked while looking at the
// row, and bouncing to a route and back would lose your place in the library. The header shows
// whose history it is; a strip sums it up; chips narrow it to one kind; the events run newest
// first down a rail under sticky day headings, a run of one type by one person folded into one
// entry. The feed's one paged read, scoped to the document; nothing else is asked for.

import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import {
  CATEGORY_LABELS,
  CompactEmptyState,
  TimelineErrorState,
  buildHistory,
  collapseSameDayCreate,
  filterHistory,
  historyCategories,
  historyCreatedAt,
  lucideGlyph,
  summariseHistory,
  type TimelineCategory,
  type TimelineEvent,
} from '@livedoc/ui';
import { lucideHistory } from '@livedoc/icons/lucide';
import { TIMELINE_PAGE_SIZE } from '@livedoc/api-schema';
import { Dialog } from '@/components/dialogs/Dialog';
import { useTimelineFeed } from '@/app/explorer/useTimelineFeed';
import { eventPersonKey } from '@/app/explorer/timeline/event-person';
import type { PaneDocument } from '@/app/explorer/views';
import { track } from '@/lib/telemetry';
import { HistoryChips } from './document-history/HistoryChips';
import { HistoryHeader } from './document-history/HistoryHeader';
import { HistoryPaging } from './document-history/HistoryPaging';
import { HistoryRail } from './document-history/HistoryRail';
import { HistorySkeleton } from './document-history/HistorySkeleton';
import { HistorySummary } from './document-history/HistorySummary';
import { HISTORY_LINK, INSET, MUTED } from './document-history/history-styles';

const HistoryGlyph = lucideGlyph(lucideHistory, 18);

export function DocumentHistoryDialog({
  open,
  onClose,
  ownerId,
  documentId,
  documentName,
  document,
}: {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  documentId: string | null;
  documentName: string | null;
  // The Explorer's row for the document, when it has one loaded: its owner, when it was made and
  // when it last changed.
  document?: PaneDocument;
}) {
  const titleId = useId();
  const name = document?.name ?? documentName ?? 'Untitled';
  return (
    <Dialog
      open={open && documentId !== null}
      onClose={onClose}
      titleId={titleId}
      size="xl"
      className="sm:max-h-[min(46rem,calc(100dvh-4rem))]"
    >
      {documentId ? (
        // Keyed on the id so switching rows remounts rather than showing the previous
        // document's history while the new one loads.
        <DocumentHistory
          key={documentId}
          titleId={titleId}
          ownerId={ownerId}
          documentId={documentId}
          name={name}
          document={document}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function DocumentHistory({
  titleId,
  ownerId,
  documentId,
  name,
  document,
  onClose,
}: {
  titleId: string;
  ownerId: string;
  documentId: string;
  name: string;
  document: PaneDocument | undefined;
  onClose: () => void;
}) {
  const feed = useTimelineFeed(ownerId, true, { scopeType: 'document', scopeId: documentId });
  // One clock for the dialog, so the day headings and "2 hours ago" agree and never shift while
  // it is read.
  const [now] = useState(() => Date.now());
  const [category, setCategory] = useState<TimelineCategory | null>(null);
  // The feed's same-day create rule (§2.1a) holds here too.
  const events = useMemo(() => collapseSameDayCreate(feed.events), [feed.events]);
  const chips = useMemo(() => historyCategories(events), [events]);
  // Who is who: the reader by id, everyone else by the name the event carries (§2.10).
  const personKey = useCallback((e: TimelineEvent) => eventPersonKey(e, ownerId), [ownerId]);
  const summary = useMemo(() => summariseHistory(events, personKey), [events, personKey]);
  const active = category && chips.some((c) => c.category === category) ? category : null;
  const days = useMemo(
    () => buildHistory(filterHistory(events, active), now, personKey),
    [events, active, now, personKey],
  );
  const railId = useId();

  const choose = (next: TimelineCategory | null) => {
    if (next) track('Timeline', 'Selected', next);
    setCategory(next);
  };

  const first = events.length === 0;
  let body: ReactNode;
  if (first && feed.loading) body = <HistorySkeleton />;
  else if (first && feed.error)
    body = (
      <div className={`py-6 ${INSET}`}>
        <TimelineErrorState
          title="Couldn’t load its history"
          description="Its history is safe. Check your connection, then try again."
          onRetry={feed.retry}
        />
      </div>
    );
  else if (first)
    body = (
      <CompactEmptyState
        className="py-12"
        icon={<HistoryGlyph />}
        title="Nothing has happened yet"
        description="What is done to this document lands here: made, edited, commented on, shared, moved."
      />
    );
  else
    body = (
      <>
        {days.length === 0 && active ? (
          <p className={`py-10 text-center text-body ${INSET} ${MUTED}`}>
            No {CATEGORY_LABELS[active].toLowerCase()} in the {events.length} events loaded.{' '}
            <button type="button" onClick={() => choose(null)} className={HISTORY_LINK}>
              Show all
            </button>
          </p>
        ) : (
          <HistoryRail days={days} viewerId={ownerId} idPrefix={railId} />
        )}
        <HistoryPaging
          shown={events.length}
          hasMore={feed.hasMore}
          loadingMore={feed.loadingMore}
          failed={feed.loadMoreFailed}
          longerThanAPage={feed.events.length > TIMELINE_PAGE_SIZE}
          onLoadMore={feed.loadMore}
        />
      </>
    );

  return (
    <>
      <HistoryHeader
        titleId={titleId}
        ownerId={ownerId}
        documentId={documentId}
        name={name}
        document={document}
        onClose={onClose}
      />
      {first ? null : (
        <HistorySummary
          createdAt={historyCreatedAt(document?.createdAt, events)}
          changedAt={document?.savedAt ?? null}
          now={now}
          count={summary.count}
          more={feed.hasMore}
          people={summary.people}
          viewerId={ownerId}
        />
      )}
      {chips.length > 1 ? (
        <HistoryChips chips={chips} total={events.length} active={active} onChange={choose} />
      ) : null}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-busy={feed.loading || feed.loadingMore || undefined}
      >
        {body}
      </div>
    </>
  );
}

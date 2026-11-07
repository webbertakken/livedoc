'use client';

// The Inbox (docs/specs/013-workspace/inbox.md §1; docs/specs/013-workspace/inbox.md): what is outstanding
// for the reader, as a list
// and a reading pane. The list holds every row newest first under Today, Earlier This Week and Older, with a filter
// bar over it; choosing a row shows it in the pane beside the list. Under 768 px, and always in the editor's
// panel, the pane takes the list's place with Back to Inbox (the browser's Back and Esc too).
//
// The list is a listbox: focus stays on it while j/k or the arrows move the choice, ↵ opens the row (in the editor
// side by side, the pane where it stands in for the list), r replies and e resolves or marks done where offered.
// The model is ./inbox-entries, the rows ./InboxRows, the pane ./InboxReader, the history entry
// ./useInboxPaneHistory.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { SOLID_BRAND_DARK_CONTROL, useMediaQuery } from '@livedoc/ui';
import type { ActivityFeed } from '@/app/explorer/useActivityFeed';
import { LIST_CARD } from '@/components/primitives/surface-classes';
import { track } from '@/lib/telemetry';
import {
  filterEntries,
  inboxEntries,
  inboxFilterCounts,
  INBOX_FILTER_LABEL,
  INBOX_FILTER_TELEMETRY,
  type InboxFilter,
} from './inbox-entries';
import type { InboxDone } from './inbox-verbs';
import { InboxEmptyState, InboxFailedState } from './inbox-states';
import { InboxFilterBar, InboxRowList, InboxSkeleton } from './InboxRows';
import { InboxReader, type InboxReaderHandle } from './InboxReader';
import { useInboxFilter } from './useInboxFilter';
import { useInboxPaneHistory } from './useInboxPaneHistory';

/** Below this the list stands alone and the pane takes its place (Tailwind's `md`). */
export const INBOX_STACKED_QUERY = '(max-width: 767px)';

const rows = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`;

export function InboxPane({
  feed,
  ownerId,
  compact = false,
  done = null,
}: {
  feed: ActivityFeed;
  ownerId: string;
  // Inside the editor's Explorer panel: always stacked, the small empty state.
  compact?: boolean;
  // The editor's Mark Done for its open tab (§5); absent on the page.
  done?: InboxDone | null;
}) {
  // Once per visit to the section, not per read: the feed re-reads on return-to-tab and a guest signing in.
  useEffect(() => {
    track('Activity', 'Opened');
  }, []);

  const narrow = useMediaQuery(INBOX_STACKED_QUERY);
  const stacked = compact || narrow;
  const [filter, storeFilter] = useInboxFilter(ownerId);

  const entries = useMemo(() => inboxEntries(feed), [feed]);
  const counts = useMemo(() => inboxFilterCounts(entries), [entries]);
  const visible = useMemo(() => filterEntries(entries, filter), [entries, filter]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const picked = selectedKey ? visible.find((e) => e.key === selectedKey) : undefined;
  // Side by side the pane always shows a row: the choice, else the first.
  const selected = picked ?? (stacked ? undefined : visible[0]);
  const selectedIndex = selected ? visible.indexOf(selected) : -1;
  const paneStands = stacked && paneOpen && picked !== undefined;
  const showPane = stacked ? paneStands : selected !== undefined;

  const listRef = useRef<HTMLUListElement>(null);
  const reader = useRef<InboxReaderHandle>(null);
  const scrollTo = useRef<number | null>(null);
  const baseId = useId();
  const rowId = useCallback((i: number) => `${baseId}-row-${i}`, [baseId]);
  const [message, setMessage] = useState('');

  const focusList = () => requestAnimationFrame(() => listRef.current?.focus());

  // Back pressed: the entry is gone already; the list comes back.
  useInboxPaneHistory(paneStands, () => {
    setPaneOpen(false);
    focusList();
  });
  useEffect(() => {
    if (paneStands) reader.current?.focusTitle();
  }, [paneStands]);

  const setFilter = (next: InboxFilter) => {
    if (next === filter) return;
    track('Activity', 'Changed', INBOX_FILTER_TELEMETRY[next]);
    storeFilter(next);
    setSelectedKey(null);
    setMessage(`${INBOX_FILTER_LABEL[next]}: ${rows(counts[next])}`);
  };

  const openPane = (key: string) => {
    setSelectedKey(key);
    setPaneOpen(true);
  };
  const closePane = () => {
    setPaneOpen(false);
    focusList();
  };
  const onPick = useCallback(
    (key: string) => {
      setSelectedKey(key);
      if (stacked) setPaneOpen(true);
    },
    [stacked],
  );

  const move = (to: number) => {
    if (visible.length === 0) return;
    const i = Math.max(0, Math.min(visible.length - 1, to));
    setSelectedKey(visible[i]!.key);
    scrollTo.current = i;
  };
  useEffect(() => {
    const i = scrollTo.current;
    if (i === null) return;
    scrollTo.current = null;
    document.getElementById(rowId(i))?.scrollIntoView?.({ block: 'nearest' });
  });

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const at = selectedIndex;
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        move(at < 0 ? 0 : at + 1);
        return;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        move(at < 0 ? 0 : at - 1);
        return;
      case 'Home':
        e.preventDefault();
        move(0);
        return;
      case 'End':
        e.preventDefault();
        move(visible.length - 1);
        return;
      case 'Enter':
      case ' ':
        if (!selected) return;
        e.preventDefault();
        if (stacked) openPane(selected.key);
        else if (e.key === 'Enter') reader.current?.open();
    }
  };

  // r and e anywhere in the Inbox but a field; Esc returns from the pane to the list.
  const onRootKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey || e.defaultPrevented) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]'))
      return;
    if (e.key === 'Escape' && paneStands) {
      e.preventDefault();
      closePane();
      return;
    }
    if (!showPane) return;
    if (e.key === 'r' && reader.current?.reply()) e.preventDefault();
    else if (e.key === 'e' && reader.current?.primary()) e.preventDefault();
  };

  // A row whose work was done here leaves the list at once (§1.5); stacked, the pane goes with it.
  const { dismiss } = feed;
  const onGone = useCallback(
    (key: string) => {
      dismiss(key);
      if (stacked) setPaneOpen(false);
      focusList();
    },
    [dismiss, stacked],
  );

  const retry = () => feed.retry();

  let body: ReactNode;
  if (feed.error) {
    body = <InboxFailedState onRetry={retry} />;
  } else if (feed.loading) {
    body = (
      <div className={compact ? '' : LIST_CARD}>
        <InboxSkeleton />
      </div>
    );
  } else if (entries.length === 0) {
    body = <InboxEmptyState compact={compact} />;
  } else {
    const list = (
      <div className="flex min-h-0 min-w-0 flex-col" data-inbox-list="">
        <InboxFilterBar filter={filter} counts={counts} onChange={setFilter} stacked={stacked} />
        {visible.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Nothing in {INBOX_FILTER_LABEL[filter]}
            </p>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`mt-3 inline-flex min-h-9 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${SOLID_BRAND_DARK_CONTROL}`}
            >
              Show All
            </button>
          </div>
        ) : null}
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-label={`Inbox, ${INBOX_FILTER_LABEL[filter]}`}
          aria-activedescendant={selectedIndex >= 0 ? rowId(selectedIndex) : undefined}
          onKeyDown={onListKey}
          hidden={visible.length === 0}
          className="min-h-0 flex-1 overflow-y-auto pb-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
        >
          <InboxRowList
            visible={visible}
            selectedKey={selected?.key ?? null}
            rowId={rowId}
            stacked={stacked}
            onPick={onPick}
          />
        </ul>
      </div>
    );
    const pane = selected ? (
      <InboxReader
        ref={reader}
        entry={selected}
        ownerId={ownerId}
        done={done}
        stacked={stacked}
        onBack={stacked ? closePane : undefined}
        onGone={onGone}
        announce={setMessage}
      />
    ) : null;
    if (stacked) {
      body = paneStands ? (
        <div
          data-inbox-pane="standing"
          className={
            compact
              ? 'px-1 pb-6'
              : 'fixed inset-0 z-40 overflow-y-auto bg-white px-4 pb-10 pt-3 dark:bg-slate-900'
          }
        >
          {pane}
        </div>
      ) : (
        <div className={compact ? '' : LIST_CARD}>{list}</div>
      );
    } else {
      body = (
        <div
          className={`grid h-[calc(100dvh-12rem)] min-h-[32rem] grid-cols-[22rem_minmax(0,1fr)] ${LIST_CARD}`}
        >
          <div className="flex min-h-0 flex-col border-r border-slate-200 dark:border-slate-700">
            {list}
          </div>
          <div data-inbox-pane="beside" className="min-h-0 overflow-y-auto px-8 py-6">
            {pane}
          </div>
        </div>
      );
    }
  }

  return (
    <div data-explorer-view="inbox" onKeyDown={onRootKey} className="min-w-0">
      {body}
      <p className="sr-only" aria-live="polite" data-inbox-live="">
        {message}
      </p>
    </div>
  );
}

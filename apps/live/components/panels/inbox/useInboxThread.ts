'use client';

import { useEffect, useState } from 'react';
import type { DocumentCommentThread } from '@livedoc/api-schema';
import type { InboxEntry } from './inbox-entries';
import { readThread } from './inbox-verbs';

// The chosen thread's comments for the reading pane (docs/specs/013-workspace/inbox.md §1.4): read only once the
// choice has rested, so moving through the list with j/k asks nothing on the way, and kept (bounded), so coming back
// to a row asks nothing again. A row's newer comment, or a reply sent from here (`bump`), reads it afresh.
export const INBOX_PANE_SETTLE_MS = 200;
export const INBOX_THREAD_CACHE_MAX = 64;

const cache = new Map<string, DocumentCommentThread | null>();

function remember(key: string, value: DocumentCommentThread | null) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > INBOX_THREAD_CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

/** `undefined` while reading (or for a row that is no element thread); null when the read failed or the thread is
 *  no longer open, and the pane falls back on the row's latest comment. */
export function useInboxThread(
  ownerId: string,
  entry: InboxEntry | undefined,
  bump: number,
): DocumentCommentThread | null | undefined {
  // A text document's thread is read from nowhere (inbox.md D229): the pane shows its latest comment.
  const row =
    entry?.kind === 'Thread' && !entry.row.local && entry.row.anchor !== 'text' ? entry.row : null;
  const key = row && entry ? `${ownerId}|${entry.key}@${entry.at}:${bump}` : null;
  const [held, setHeld] = useState<{ key: string; value: DocumentCommentThread | null } | null>(
    null,
  );
  const cached = key !== null && cache.has(key);

  useEffect(() => {
    if (key === null || row === null || cached) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      readThread(ownerId, row, controller.signal).then(
        (value) => {
          if (controller.signal.aborted) return;
          remember(key, value);
          setHeld({ key, value });
        },
        (err: unknown) => {
          if (controller.signal.aborted) return;
          console.warn('[inbox] thread-read-failed', err);
          remember(key, null);
          setHeld({ key, value: null });
        },
      );
    }, INBOX_PANE_SETTLE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, cached, ownerId, row]);

  if (key === null) return undefined;
  if (cache.has(key)) return cache.get(key);
  return held?.key === key ? held.value : undefined;
}

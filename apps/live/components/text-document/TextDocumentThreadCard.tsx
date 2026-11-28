'use client';

// A comment thread's card in the margin (docs/specs/034-text-documents/review.md "Threads in the margin"): the office
// thread card, named by its first author and quote, reading "Original content deleted" and the quote once the text is
// gone.
import type { ComponentProps } from 'react';
import type { TextDocumentThread } from '@livedoc/text-documents';
import { OfficeThreadCard } from '@/components/office/review/OfficeThreadCard';

/** How a card names itself to a screen reader: its first author and the start of its quote. */
export function cardLabel(thread: TextDocumentThread): string {
  const quote = thread.quote.length > 40 ? `${thread.quote.slice(0, 40)}…` : thread.quote;
  const by = thread.comments[0]?.author.name || 'someone';
  return quote ? `Comment by ${by} on “${quote}”` : `Comment by ${by}`;
}

export function TextDocumentThreadCard({
  thread,
  deleted,
  ...card
}: Omit<ComponentProps<typeof OfficeThreadCard>, 'thread' | 'label' | 'deleted'> & {
  thread: TextDocumentThread;
  deleted: boolean;
}) {
  return (
    <OfficeThreadCard
      {...card}
      thread={thread}
      label={cardLabel(thread)}
      deleted={
        deleted ? (
          <div className="border-b border-slate-100 px-3 pt-2 pb-1.5 dark:border-slate-800">
            <p className="text-supporting text-slate-500 dark:text-slate-400">
              Original content deleted
            </p>
            <p className="truncate text-body text-slate-600 italic dark:text-slate-300">
              {thread.quote}
            </p>
          </div>
        ) : null
      }
    />
  );
}

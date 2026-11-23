'use client';

// The reading pane's body (docs/specs/013-workspace/inbox.md §1.4): an element thread's comments once read (the row's
// latest comment until then, or when the read fails, D188), a card thread's latest comment, an action's note, a
// card's type and board, a form's count.

import { GlyphDisc, IDENTITY_FILL, identityVars } from '@livedoc/ui';
import { ITEM_TYPES } from '@livedoc/items';
import { initialsOf } from '@/lib/identity';
import { formatRelativeTimeShort } from '@/lib/relative-time';
import type { InboxEntry } from './inbox-entries';
import type { useInboxThread } from './useInboxThread';

type Comment = { key: string; name: string; color: string; at: number; text: string };

export function InboxReaderBody({
  entry,
  thread,
  sent,
  now,
}: {
  entry: InboxEntry;
  thread: ReturnType<typeof useInboxThread>;
  sent: { text: string; at: number }[];
  now: number;
}) {
  switch (entry.kind) {
    case 'Thread':
    case 'CardThread': {
      const latest = entry.row.latest;
      // The whole thread once read; until then, or when it can't be, the row's latest comment (D188).
      const comments: Comment[] =
        entry.kind === 'Thread' && thread
          ? thread.comments.map((c) => ({
              key: c.id,
              name: c.authorName,
              color: c.authorColor,
              at: c.createdAt,
              text: c.text,
            }))
          : [
              {
                key: 'latest',
                name: latest.authorName,
                color: latest.authorColor,
                at: latest.at,
                text: latest.text,
              },
              ...(thread ? [] : sent).map((s, i) => ({
                key: `sent-${i}`,
                name: 'You',
                color: '',
                at: s.at,
                text: s.text,
              })),
            ];
      return (
        <ol className="flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          {comments.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              <GlyphDisc
                size={24}
                aria-hidden
                className={`text-glyph text-white ${c.color ? IDENTITY_FILL : 'bg-brand-700'}`}
                style={c.color ? identityVars(c.color) : undefined}
              >
                {initialsOf(c.name)}
              </GlyphDisc>
              <div className="min-w-0 flex-1">
                <p className="text-supporting text-slate-500 dark:text-slate-400">
                  <span className="text-slate-800 dark:text-slate-100">{c.name}</span> ·{' '}
                  {formatRelativeTimeShort(now - c.at)}
                </p>
                <p className="whitespace-pre-wrap break-words text-body text-slate-800 dark:text-slate-200">
                  {c.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      );
    }
    case 'Action':
      return entry.row.description ? (
        <p className="whitespace-pre-wrap break-words border-t border-slate-200 pt-3 text-body text-slate-800 dark:border-slate-700 dark:text-slate-200">
          {entry.row.description}
        </p>
      ) : null;
    case 'Card': {
      const type = ITEM_TYPES.find((t) => t.id === entry.row.type)?.label ?? 'Card';
      return (
        <p className="border-t border-slate-200 pt-3 text-body text-slate-700 dark:border-slate-700 dark:text-slate-300">
          {entry.row.board ? `${type} on ${entry.row.board.title}` : `${type}, not on a board`}
        </p>
      );
    }
    case 'FormResponses':
      return (
        <p className="border-t border-slate-200 pt-3 text-body text-slate-700 dark:border-slate-700 dark:text-slate-300">
          {entry.row.unseen === 1
            ? `1 new response to ${entry.row.heading} waits on its board.`
            : `${entry.row.unseen} new responses to ${entry.row.heading} wait on its board.`}
        </p>
      );
  }
}

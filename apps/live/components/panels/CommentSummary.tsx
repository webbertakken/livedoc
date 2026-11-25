'use client';

// A comment drawn small, as a list of threads shows one (docs/specs/012-collaboration/review-surfaces.md "The comments
// panel"): its author's disc, name and time, a line under the name (a file's "From the file"), and its text cut to
// three lines. It holds no control of its own, so a row's one button names it.
import type { ReactNode } from 'react';
import { IDENTITY_FILL, identityVars } from '@livedoc/ui';
import type { Comment } from '@livedoc/document';
import { AuthorDisc } from '@/components/primitives/AuthorDisc';
import { MentionText } from '@/components/primitives/MentionText';
import { initialsOf } from '@/lib/identity';
import { formatRelativeTimeCompact, useRelativeNow } from '@/lib/relative-time';

export function CommentSummary({
  comment,
  note,
  children,
}: {
  comment: Comment;
  note: string | null;
  /** More lines under the text, in its column (a reply count). */
  children?: ReactNode;
}) {
  const now = useRelativeNow();
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 inline-flex">
        <AuthorDisc
          commentId={comment.id}
          authorId={comment.authorId}
          size={24}
          as="div"
          aria-hidden
          style={identityVars(comment.authorColor)}
          className={`text-glyph text-white ${IDENTITY_FILL}`}
        >
          {initialsOf(comment.authorName)}
        </AuthorDisc>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1 text-body">
          <span className="truncate text-slate-900 dark:text-slate-50">{comment.authorName}</span>
          <time
            dateTime={new Date(comment.createdAt).toISOString()}
            className="shrink-0 text-supporting text-slate-500 dark:text-slate-400"
          >
            {formatRelativeTimeCompact(now - comment.createdAt)}
          </time>
        </div>
        {note ? <p className="text-supporting text-slate-500 dark:text-slate-400">{note}</p> : null}
        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-body text-slate-700 dark:text-slate-200">
          <MentionText
            text={comment.text}
            mentions={comment.mentions}
            chipClassName="bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
          />
        </p>
        {children}
      </div>
    </div>
  );
}

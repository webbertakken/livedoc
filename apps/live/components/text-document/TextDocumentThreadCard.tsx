'use client';

// A comment thread's card in the margin (docs/specs/034-text-documents/review.md "Threads in the margin"): its
// comments drawn by the shared thread parts, "From the file" under a file's author, "Original content deleted" and the
// quote once the text is gone, Resolve for whoever may comment, Edit on one's own comments, Delete on one's own (an
// Editor's on any), and Reply while the thread is selected. Deleting the first comment asks first: it takes the thread.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Comment } from '@livedoc/document';
import type { TextDocumentComment, TextDocumentThread } from '@livedoc/text-documents';
import {
  CommentComposer,
  CommentResolveToggle,
  CommentThreadList,
} from '@/components/panels/comment-thread-parts';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { Button } from '@livedoc/ui';
import type { TextDocumentCommenter } from './useTextDocumentThreads';

/** A text document's comment as the shared thread parts draw one. */
export const sharedComment = (c: TextDocumentComment): Comment & { fromFile?: true } => ({
  id: c.id,
  text: c.text,
  createdAt: c.at,
  authorName: c.author.name,
  authorColor: c.author.colour,
  ...(c.author.key ? { authorId: c.author.key } : {}),
  ...(c.author.fromFile ? { fromFile: true as const } : {}),
});

const FROM_THE_FILE = 'From the file';
const noteOf = (c: Comment): string | null =>
  (c as { fromFile?: true }).fromFile ? FROM_THE_FILE : null;

/** How a card names itself to a screen reader: its first author and the start of its quote. */
export function cardLabel(thread: TextDocumentThread): string {
  const quote = thread.quote.length > 40 ? `${thread.quote.slice(0, 40)}…` : thread.quote;
  const by = thread.comments[0]?.author.name || 'someone';
  return quote ? `Comment by ${by} on “${quote}”` : `Comment by ${by}`;
}

const CARD =
  'rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-shadow motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900';

export function TextDocumentThreadCard({
  thread,
  deleted,
  selected,
  commenter,
  onSelect,
  onReply,
  onEdit,
  onRemove,
  onResolve,
}: {
  thread: TextDocumentThread;
  deleted: boolean;
  selected: boolean;
  commenter: TextDocumentCommenter | null;
  onSelect: () => void;
  onReply: (text: string) => void;
  onEdit: (commentId: string, text: string) => void;
  onRemove: (commentId: string) => void;
  onResolve: (resolved: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const first = thread.comments[0]?.id;
  const remove = (commentId: string) =>
    commentId === first ? setConfirming(true) : onRemove(commentId);
  return (
    // A card is selected by a press anywhere on it; its buttons and fields do their own work.
    <div
      role="group"
      aria-label={cardLabel(thread)}
      aria-current={selected ? 'true' : undefined}
      data-thread-card={thread.id}
      onClick={() => !selected && onSelect()}
      className={`${CARD} ${selected ? 'shadow-lg ring-1 ring-brand-400/40' : 'cursor-pointer'}`}
    >
      {deleted ? (
        <div className="border-b border-slate-100 px-3 pt-2 pb-1.5 dark:border-slate-800">
          <p className="text-supporting text-slate-500 dark:text-slate-400">
            Original content deleted
          </p>
          <p className="truncate text-body text-slate-600 italic dark:text-slate-300">
            {thread.quote}
          </p>
        </div>
      ) : null}
      {commenter ? (
        <div className="flex justify-end px-1 pt-1">
          <CommentResolveToggle
            resolved={thread.resolved}
            onResolve={() => onResolve(true)}
            onUnresolve={() => onResolve(false)}
          />
        </div>
      ) : null}
      <CommentThreadList
        thread={{ resolved: false, comments: thread.comments.map(sharedComment) }}
        readOnly={!commenter?.mayDeleteAny}
        selfId={commenter?.key ?? ''}
        canComment={commenter !== null}
        onDeleteComment={remove}
        onEditComment={commenter ? onEdit : undefined}
        noteOf={noteOf}
        className="max-h-96 overflow-y-auto px-3 py-1"
      />
      {selected && commenter ? <CommentComposer onAddComment={(text) => onReply(text)} /> : null}
      <ConfirmDialog
        open={confirming}
        title="Delete this comment thread?"
        message="The thread and its replies are deleted for everyone."
        onConfirm={() => {
          setConfirming(false);
          if (first) onRemove(first);
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

/** A comment not yet sent: its field focused, Comment sends it, Cancel or Escape drops it. */
export function TextDocumentDraftCard({
  commenter,
  onSend,
  onCancel,
}: {
  commenter: TextDocumentCommenter;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  // Focused once the menu or button that opened it has closed and handed the focus back, two frames on.
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => field.current?.focus());
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };
  return (
    // Escape anywhere in the draft drops it, as Cancel does.
    <div
      role="group"
      aria-label="New comment"
      data-thread-card="draft"
      onKeyDown={onKeyDown}
      className={`${CARD} shadow-lg`}
    >
      <p className="px-3 pt-2 text-body text-slate-900 dark:text-slate-50">{commenter.name}</p>
      <CommentComposer fieldRef={field} onAddComment={(text) => onSend(text)} />
      <div className="flex justify-end px-2 pb-2">
        <Button size="xs" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

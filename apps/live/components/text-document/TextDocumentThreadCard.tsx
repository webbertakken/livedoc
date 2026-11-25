'use client';

// A comment thread's card in the margin (docs/specs/034-text-documents/review.md "Threads in the margin"): its
// comments drawn by the shared thread parts, "From the file" under a file's author, "Original content deleted" and the
// quote once the text is gone, Resolve for whoever may comment, Edit on one's own comments, Delete on one's own (an
// Editor's on any), and Reply while the thread is selected. Deleting the first comment asks first: it takes the thread.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { TextDocumentThread } from '@livedoc/text-documents';
import { commentNoteOf, sharedComment } from '@/lib/text-document/text-document-comment-rows';
import {
  CommentComposer,
  CommentResolveToggle,
  CommentThreadList,
} from '@/components/panels/comment-thread-parts';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { Button } from '@livedoc/ui';
import type { TextDocumentCommenter } from '@/lib/text-document/text-document-commenter';

/** How a card names itself to a screen reader: its first author and the start of its quote. */
export function cardLabel(thread: TextDocumentThread): string {
  const quote = thread.quote.length > 40 ? `${thread.quote.slice(0, 40)}…` : thread.quote;
  const by = thread.comments[0]?.author.name || 'someone';
  return quote ? `Comment by ${by} on “${quote}”` : `Comment by ${by}`;
}

const CARD =
  'rounded-surface border border-slate-200 bg-white text-left shadow-sm transition-shadow motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900';

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
  onStep,
  onExit,
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
  /** J and K: the next or the previous thread. */
  onStep: (forward: boolean) => void;
  /** U and Escape: let the thread go, the writing taking the keyboard. */
  onExit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const replyField = useRef<HTMLTextAreaElement>(null);
  // The keys on a selected comment, heard on the card itself, never in its fields (review.md "Keys on a selected
  // comment"); R and E only for whoever may comment.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const run =
      key === 'j' || key === 'k'
        ? () => onStep(key === 'j')
        : key === 'u' || key === 'escape'
          ? onExit
          : key === 'e' && commenter
            ? () => {
                onResolve(true);
                onExit();
              }
            : key === 'r' && commenter
              ? () => {
                  if (selected) return replyField.current?.focus();
                  // Reply shows once the thread is selected, a frame on.
                  onSelect();
                  requestAnimationFrame(() => replyField.current?.focus());
                }
              : null;
    if (!run) return;
    event.preventDefault();
    event.stopPropagation();
    run();
  };
  const first = thread.comments[0]?.id;
  const remove = (commentId: string) =>
    commentId === first ? setConfirming(true) : onRemove(commentId);
  return (
    // A card is selected by a press anywhere on it; its buttons and fields do their own work.
    <div
      role="group"
      aria-label={cardLabel(thread)}
      aria-current={selected ? 'true' : undefined}
      aria-keyshortcuts={commenter ? 'R J K E U' : 'J K U'}
      tabIndex={-1}
      data-thread-card={thread.id}
      onClick={() => !selected && onSelect()}
      onKeyDown={onKeyDown}
      className={`${CARD} outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) ${selected ? 'shadow-lg ring-1 ring-brand-400/40' : 'cursor-pointer'}`}
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
        noteOf={commentNoteOf}
        className="max-h-96 overflow-y-auto px-3 py-1"
      />
      {selected && commenter ? (
        <CommentComposer fieldRef={replyField} onAddComment={(text) => onReply(text)} />
      ) : null}
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
  placed,
  onSend,
  onCancel,
}: {
  commenter: TextDocumentCommenter;
  /** The margin has placed it: hidden until then, it can take no focus. */
  placed: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  // Focused once the margin has placed it and the menu or button that opened it has handed the focus back, two frames
  // on.
  useEffect(() => {
    if (!placed) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => field.current?.focus());
    });
    return () => cancelAnimationFrame(frame);
  }, [placed]);
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

'use client';

// A suggestion's card in the margin (docs/specs/034-text-documents/review.md "Suggestion cards"): its author's disc,
// name and time, "From the file" under a file's author, what it does one line per kind, and Accept and Reject as the
// person's rights allow, and its replies (a thread tied to it) with Reply while it is selected. Pressed, it is
// selected; on the focused card J and K step, R replies, U and Escape let it go.
import { useRef, useState, type KeyboardEvent } from 'react';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import type { CommentMention } from '@livedoc/document';
import type { TextDocumentThread } from '@livedoc/text-documents';
import { CommentComposer, CommentThreadList } from '@/components/panels/comment-thread-parts';
import { reactionChips } from '@/lib/office/review/comment-reactions';
import { commentNoteOf, sharedComment } from '@/lib/text-document/text-document-comment-rows';
import type { TextDocumentCommenter } from '@/lib/text-document/text-document-commenter';
import { CheckIcon, CloseIcon, IDENTITY_FILL, Tooltip, identityVars } from '@livedoc/ui';
import { initialsOf } from '@/lib/identity';
import { formatRelativeTimeCompact, useRelativeNow } from '@/lib/relative-time';
import { FROM_THE_FILE } from '@/lib/text-document/text-document-comment-rows';
import type { SuggestionCard } from '@/lib/text-document/text-document-suggestion-cards';
import { THREAD_CARD_CLASS } from './TextDocumentThreadCard';

/** How a card names itself to a screen reader: its author and its first line. */
export function suggestionCardLabel(card: Pick<SuggestionCard, 'author' | 'lines'>): string {
  const by = card.author.name || 'someone';
  return card.lines[0] ? `Suggestion by ${by}: ${card.lines[0]}` : `Suggestion by ${by}`;
}

const ICON_BUTTON =
  'inline-flex size-control cursor-pointer items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none motion-reduce:transition-none dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white';

/** A suggestion's replies: its tied open thread (or none yet), who comments, and what each reply does. */
export type SuggestionReplies = {
  readonly thread: TextDocumentThread | null;
  readonly commenter: TextDocumentCommenter | null;
  readonly onReply: (text: string, mentions: CommentMention[], assignee?: CommentMention) => void;
  readonly onEdit: (threadId: string, commentId: string, text: string) => void;
  readonly onRemove: (threadId: string, commentId: string) => void;
  readonly onReact: (threadId: string, commentId: string, emoji: string, on: boolean) => void;
  /** The document's people by key, naming who reacted. */
  readonly names: ReadonlyMap<string, string>;
};

export function TextDocumentSuggestionCard({
  card,
  selected,
  offers,
  onSelect,
  onAccept,
  onReject,
  onStep,
  onExit,
  replies = null,
}: {
  card: SuggestionCard;
  selected: boolean;
  offers: { accept: boolean; reject: boolean };
  onSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
  /** J and K: the next or the previous suggestion. */
  onStep: (forward: boolean) => void;
  /** U and Escape: let it go, the writing taking the keyboard. */
  onExit: () => void;
  replies?: SuggestionReplies | null;
}) {
  const replyField = useRef<HTMLTextAreaElement>(null);
  const commenter = replies?.commenter ?? null;
  const thread = replies?.thread ?? null;
  // Deleting the first reply takes the replies with it: asked first, as a thread's card asks.
  const [confirming, setConfirming] = useState(false);
  const first = thread?.comments[0]?.id;
  const remove = (commentId: string) => {
    if (!thread) return;
    if (commentId === first) setConfirming(true);
    else replies?.onRemove(thread.id, commentId);
  };
  const now = useRelativeNow();
  const when = new Date(card.at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const run =
      key === 'j' || key === 'k'
        ? () => onStep(key === 'j')
        : key === 'u' || key === 'escape'
          ? onExit
          : key === 'r' && commenter
            ? () => {
                if (selected) return replyField.current?.focus();
                // Reply shows once the card is selected, a frame on.
                onSelect();
                requestAnimationFrame(() => replyField.current?.focus());
              }
            : null;
    if (!run) return;
    event.preventDefault();
    event.stopPropagation();
    run();
  };
  return (
    // A card is selected by a press anywhere on it; its buttons do their own work.
    <div
      role="group"
      aria-label={suggestionCardLabel(card)}
      aria-current={selected ? 'true' : undefined}
      aria-keyshortcuts={commenter ? 'R J K U' : 'J K U'}
      tabIndex={-1}
      data-thread-card={`suggestion:${card.id}`}
      data-suggestion-card={card.id}
      onClick={() => !selected && onSelect()}
      onKeyDown={onKeyDown}
      className={`${THREAD_CARD_CLASS} outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) ${selected ? 'shadow-lg ring-1 ring-brand-400/40' : 'cursor-pointer'}`}
    >
      <div className="flex gap-2 px-3 py-2">
        <span
          aria-hidden
          style={identityVars(card.author.colour)}
          className={`mt-0.5 flex size-chip shrink-0 items-center justify-center rounded-full text-glyph text-white ${IDENTITY_FILL}`}
        >
          {card.author.initials ?? initialsOf(card.author.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1 text-body">
            <span className="truncate text-slate-900 dark:text-slate-50">{card.author.name}</span>
            {card.at > 0 ? (
              <Tooltip label={when}>
                <time
                  dateTime={new Date(card.at).toISOString()}
                  aria-label={when}
                  className="shrink-0 text-supporting text-slate-500 dark:text-slate-400"
                >
                  {formatRelativeTimeCompact(now - card.at)}
                </time>
              </Tooltip>
            ) : null}
          </div>
          {card.author.fromFile ? (
            <p className="text-supporting text-slate-500 dark:text-slate-400">{FROM_THE_FILE}</p>
          ) : null}
          {card.lines.map((line) => (
            <p key={line} className="text-body break-words text-slate-700 dark:text-slate-200">
              {line}
            </p>
          ))}
        </div>
        {offers.accept || offers.reject ? (
          <div className="flex shrink-0 items-start gap-0.5">
            {offers.accept ? (
              <Tooltip label="Accept suggestion">
                <button
                  type="button"
                  aria-label="Accept suggestion"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAccept();
                  }}
                  className={ICON_BUTTON}
                >
                  <CheckIcon size={14} />
                </button>
              </Tooltip>
            ) : null}
            {offers.reject ? (
              <Tooltip label="Reject suggestion">
                <button
                  type="button"
                  aria-label="Reject suggestion"
                  onClick={(event) => {
                    event.stopPropagation();
                    onReject();
                  }}
                  className={ICON_BUTTON}
                >
                  <CloseIcon size={14} />
                </button>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
      </div>
      {thread ? (
        <CommentThreadList
          thread={{ resolved: false, comments: thread.comments.map(sharedComment) }}
          readOnly={!commenter?.mayDeleteAny}
          selfId={commenter?.key ?? ''}
          canComment={commenter !== null}
          onDeleteComment={remove}
          onEditComment={
            commenter ? (commentId, text) => replies?.onEdit(thread.id, commentId, text) : undefined
          }
          noteOf={commentNoteOf}
          reactionsOf={(c) =>
            reactionChips(
              thread.comments.find((t) => t.id === c.id)?.reactions,
              commenter?.key ?? '',
              replies?.names ?? new Map(),
            )
          }
          onReact={
            commenter
              ? (commentId, emoji, on) => replies?.onReact(thread.id, commentId, emoji, on)
              : undefined
          }
          className="max-h-96 overflow-y-auto border-t border-slate-100 px-3 py-1 dark:border-slate-800"
        />
      ) : null}
      {selected && commenter && replies ? (
        <CommentComposer fieldRef={replyField} onAddComment={replies.onReply} />
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Delete these replies?"
        message="The replies on this suggestion are deleted for everyone."
        onConfirm={() => {
          setConfirming(false);
          if (thread && first) replies?.onRemove(thread.id, first);
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

// A text document's threads as the shared review surfaces draw them (docs/specs/034-text-documents/review.md "The
// comments panel", "Threads in the margin"): each comment in the shared shape, with "From the file" under a file's
// author; and the comments panel's rows, by document tab in the outline's order and within a tab in the order the
// threads were begun, each grouped by its tab.
import type * as Y from 'yjs';
import type { Comment, CommentMention } from '@livedoc/document';
import {
  FIRST_DOCUMENT_TAB_ID,
  drawnMentions,
  LiveSuggestions,
  LiveThreads,
  type DocumentTab,
  type TextDocumentSuggestion,
  type TextDocumentComment,
  type TextDocumentThread,
  threadAssignment,
} from '@livedoc/text-documents';
import type { ReviewThreadRow } from '@/lib/office/review/comment-filters';
import { cardLines, cardPartsOf } from './text-document-suggestion-cards';

/** A suggestion's row id in the comments panel (review.md "Suggestion cards", In the comments panel). */
export const SUGGESTION_ROW = 'suggestion:';

/** A thread's assignee: its latest comment's that carries one well formed, else none (review.md "Assigning"). */
export const threadAssignee = (thread: {
  readonly comments: readonly TextDocumentComment[];
}): CommentMention | null => threadAssignment(thread)?.assignee ?? null;

/** A text document's comment in the shared shape; its author's key is the shape's author id. */
export const sharedComment = (c: TextDocumentComment): Comment & { fromFile?: true } => {
  const mentions = drawnMentions(c.mentions);
  return {
    id: c.id,
    text: c.text,
    createdAt: c.at,
    authorName: c.author.name,
    authorColor: c.author.colour,
    ...(c.author.key ? { authorId: c.author.key } : {}),
    ...(c.author.fromFile ? { fromFile: true as const } : {}),
    ...(mentions.length ? { mentions } : {}),
  };
};

export const FROM_THE_FILE = 'From the file';
export const FROM_THE_COMPARISON = 'From the comparison';

type NotedAuthor = { readonly fromFile?: true; readonly fromComparison?: true };

/** The line under an author with no LiveDoc person behind it: a file's, or a comparison's (review.md "Suggestion cards"). */
export const authorNoteOf = (author: NotedAuthor): string | null =>
  author.fromComparison ? FROM_THE_COMPARISON : author.fromFile ? FROM_THE_FILE : null;

/** The line under a comment's author: "From the file" or "From the comparison", else none. */
export const commentNoteOf = (c: Comment): string | null => authorNoteOf(c as NotedAuthor);

/** A suggestion as its row's first comment: its card's lines, by its author, when it was made. */
function suggestionComment(suggestion: TextDocumentSuggestion): Comment & NotedAuthor {
  const { author } = suggestion;
  return {
    id: `${SUGGESTION_ROW}${suggestion.id}`,
    text: cardLines(cardPartsOf(suggestion.parts)).join('\n'),
    createdAt: suggestion.at,
    authorName: author.name,
    authorColor: author.colour,
    ...(author.key ? { authorId: author.key } : {}),
    ...(author.fromFile ? { fromFile: true as const } : {}),
    ...(author.fromComparison ? { fromComparison: true as const } : {}),
  };
}

/**
 * The comments panel's rows: by tab in the outline's order (the first tab first, unknown tabs last); in a tab its
 * threads as read, then its open suggestions as made, each with its tied thread's comments under it. A thread tied to
 * an open suggestion is no row of its own.
 */
export function commentRows(
  doc: Y.Doc,
  threads: readonly TextDocumentThread[],
  tabs: readonly DocumentTab[],
  suggestions: readonly TextDocumentSuggestion[] = LiveSuggestions.read(doc),
): ReviewThreadRow[] {
  const order = new Map(tabs.map((tab, index) => [tab.id, index]));
  if (!order.has(FIRST_DOCUMENT_TAB_ID)) order.set(FIRST_DOCUMENT_TAB_ID, -1);
  const rank = (tab: string) => order.get(tab) ?? Number.MAX_SAFE_INTEGER;
  const open = new Set(suggestions.map((s) => s.id));
  const tied = new Map(
    threads
      .filter((t) => t.suggestion !== undefined && open.has(t.suggestion) && !t.resolved)
      .map((t) => [t.suggestion!, t]),
  );
  const threadRows = threads
    .filter(
      (thread) => !(thread.suggestion !== undefined && tied.get(thread.suggestion) === thread),
    )
    .map((thread, index) => ({
      index,
      at: 0,
      row: {
        id: thread.id,
        label: thread.quote,
        deleted: LiveThreads.anchor(doc, thread)?.deleted ?? false,
        resolved: thread.resolved,
        group: thread.tab,
        assignee: threadAssignee(thread),
        comments: thread.comments.map(sharedComment),
      } satisfies ReviewThreadRow,
    }));
  const suggestionRows = suggestions.map((suggestion, index) => ({
    index: threads.length + index,
    at: suggestion.at,
    row: {
      id: `${SUGGESTION_ROW}${suggestion.id}`,
      label: '',
      deleted: false,
      resolved: false,
      group: suggestion.tab,
      assignee: null,
      kind: 'suggestion',
      comments: [
        suggestionComment(suggestion),
        ...(tied.get(suggestion.id)?.comments.map(sharedComment) ?? []),
      ],
    } satisfies ReviewThreadRow,
  }));
  return [...threadRows, ...suggestionRows]
    .sort((a, b) => rank(a.row.group) - rank(b.row.group) || a.at - b.at || a.index - b.index)
    .map(({ row }) => row);
}

/** The comments panel's third list: each document tab by its name, its emoji before it. */
export const tabGroups = (tabs: readonly DocumentTab[]): { id: string; label: string }[] =>
  tabs.map((tab) => ({ id: tab.id, label: tab.emoji ? `${tab.emoji} ${tab.name}` : tab.name }));

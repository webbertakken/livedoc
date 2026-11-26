// A text document's threads as the shared review surfaces draw them (docs/specs/034-text-documents/review.md "The
// comments panel", "Threads in the margin"): each comment in the shared shape, with "From the file" under a file's
// author; and the comments panel's rows, by document tab in the outline's order and within a tab in the order the
// threads were begun, each grouped by its tab.
import type * as Y from 'yjs';
import type { Comment, CommentMention } from '@livedoc/document';
import {
  FIRST_DOCUMENT_TAB_ID,
  LiveThreads,
  type DocumentTab,
  type TextDocumentComment,
  type TextDocumentThread,
} from '@livedoc/text-documents';
import type { ReviewThreadRow } from '@/lib/office/review/comment-filters';

const text = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** A thread's assignee: its latest comment's that carries one well formed, else none (review.md "Assigning"). */
export function threadAssignee(thread: {
  readonly comments: readonly TextDocumentComment[];
}): CommentMention | null {
  for (let i = thread.comments.length - 1; i >= 0; i -= 1) {
    const [assignee] = drawnMentions([thread.comments[i]!.assignee]);
    if (assignee) return assignee;
  }
  return null;
}

/** A comment's mentions a chip is drawn from: each with a name and handle, a file's with no account (review.md "Mentions"). */
function drawnMentions(mentions: TextDocumentComment['mentions']): CommentMention[] {
  const out: CommentMention[] = [];
  for (const m of mentions ?? []) {
    if (typeof m !== 'object' || m === null) continue;
    const { userId, memberId, name, handle } = m as Record<string, unknown>;
    if (!text(name) || !text(handle)) continue;
    out.push({
      userId: text(userId) ? userId : null,
      ...(text(memberId) ? { memberId } : {}),
      name,
      handle,
    });
  }
  return out;
}

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

/** The line under a comment's author: "From the file" for a file's comment, else none. */
export const commentNoteOf = (c: Comment): string | null =>
  (c as { fromFile?: true }).fromFile ? FROM_THE_FILE : null;

/** The comments panel's rows: by tab in the outline's order (the first tab first, unknown tabs last), then as read. */
export function commentRows(
  doc: Y.Doc,
  threads: readonly TextDocumentThread[],
  tabs: readonly DocumentTab[],
): ReviewThreadRow[] {
  const order = new Map(tabs.map((tab, index) => [tab.id, index]));
  if (!order.has(FIRST_DOCUMENT_TAB_ID)) order.set(FIRST_DOCUMENT_TAB_ID, -1);
  const rank = (tab: string) => order.get(tab) ?? Number.MAX_SAFE_INTEGER;
  return threads
    .map((thread, index) => ({ thread, index }))
    .sort((a, b) => rank(a.thread.tab) - rank(b.thread.tab) || a.index - b.index)
    .map(({ thread }) => ({
      id: thread.id,
      label: thread.quote,
      deleted: LiveThreads.anchor(doc, thread)?.deleted ?? false,
      resolved: thread.resolved,
      group: thread.tab,
      assignee: threadAssignee(thread),
      comments: thread.comments.map(sharedComment),
    }));
}

/** The comments panel's third list: each document tab by its name, its emoji before it. */
export const tabGroups = (tabs: readonly DocumentTab[]): { id: string; label: string }[] =>
  tabs.map((tab) => ({ id: tab.id, label: tab.emoji ? `${tab.emoji} ${tab.name}` : tab.name }));

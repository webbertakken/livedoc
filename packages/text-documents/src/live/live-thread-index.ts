// What a text document's comment threads put in the collaboration index (docs/specs/013-workspace/inbox.md §2.7): a
// row per thread with a comment, and an action row per thread a comment assigns (review.md "Assigning"). Pure, built
// from the threads the live state holds when the tab's push refreshes its digest. Authors stay adder keys here: the
// api turns them into the identities they were made from, which only it can.
import {
  actionNameOf,
  cutAtWord,
  type CollabActionRow,
  type CollabIndexRows,
  type CollabThreadRow,
  type CommentMention,
} from '@livedoc/document';
import type { TextDocumentComment, TextDocumentThread } from './live-threads';

/** The longest label a thread's row carries (inbox.md D231). */
export const INBOX_QUOTE_MAX = 100;

/** What a thread on no text is called in a row (inbox.md D231). */
const POINT_LABEL = 'Comment';

const text = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** A thread's row label: its quote on one line, cut at a word, or "Comment" for a comment on no text. */
export function threadLabel(quote: string): string {
  const line = quote.replace(/\s+/g, ' ').trim();
  return line ? cutAtWord(line, INBOX_QUOTE_MAX) : POINT_LABEL;
}

/** A comment's mentions as drawn: each with a name and handle, a file's with no account (review.md "Mentions"). */
export function drawnMentions(mentions: TextDocumentComment['mentions']): CommentMention[] {
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

/** The thread's current assignment: its latest comment that carries an assignee, and that assignee. */
export function threadAssignment(thread: {
  readonly comments: readonly TextDocumentComment[];
}): { comment: TextDocumentComment; assignee: CommentMention } | null {
  for (let i = thread.comments.length - 1; i >= 0; i -= 1) {
    const comment = thread.comments[i]!;
    const [assignee] = drawnMentions([comment.assignee]);
    if (assignee) return { comment, assignee };
  }
  return null;
}

function threadRow(thread: TextDocumentThread): CollabThreadRow {
  let first = thread.comments[0]!;
  let latest = first;
  const participants: string[] = [];
  const mentioned: string[] = [];
  for (const c of thread.comments) {
    if (c.at < first.at) first = c;
    if (c.at >= latest.at) latest = c;
    const key = c.author.key;
    if (key && !participants.includes(key)) participants.push(key);
    for (const m of drawnMentions(c.mentions))
      for (const id of [m.userId, m.memberId])
        if (id && !mentioned.includes(id)) mentioned.push(id);
  }
  return {
    elementId: thread.id,
    elementLabel: threadLabel(thread.quote),
    resolved: thread.resolved,
    commentCount: thread.comments.length,
    participantIds: participants,
    mentionedIds: mentioned,
    latestText: latest.text,
    latestAuthorName: latest.author.name,
    latestAuthorColor: latest.author.colour,
    firstAt: first.at,
    latestAt: latest.at,
  };
}

function actionRow(
  thread: TextDocumentThread,
  row: CollabThreadRow,
  teamId: string | null,
): CollabActionRow | null {
  const assignment = threadAssignment(thread);
  if (!assignment) return null;
  const { comment, assignee } = assignment;
  return {
    elementId: thread.id,
    actionId: comment.id,
    elementLabel: row.elementLabel,
    name: actionNameOf(comment.text),
    description: comment.text,
    status: thread.resolved ? 'done' : 'open',
    assigneeUserId: assignee.userId,
    assigneeMemberId: assignee.memberId ?? null,
    assigneeName: assignee.name,
    assignerId: comment.author.key ?? '',
    assignerName: comment.author.name,
    teamId,
    createdAt: comment.at,
    updatedAt: row.latestAt,
  };
}

/** The rows the threads make, their authors as adder keys; `teamId` the document's team, for the action rows. */
export function textDocumentCollabRows(
  threads: readonly TextDocumentThread[],
  teamId: string | null,
): CollabIndexRows {
  const rows: CollabIndexRows = { actions: [], threads: [] };
  for (const thread of threads) {
    if (thread.comments.length === 0) continue;
    const row = threadRow(thread);
    rows.threads.push(row);
    const action = actionRow(thread, row, teamId);
    if (action) rows.actions.push(action);
  }
  return rows;
}

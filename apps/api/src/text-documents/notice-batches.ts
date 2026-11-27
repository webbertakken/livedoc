// What a text document's notification email holds for each person (docs/specs/034-text-documents/review.md
// "Notifications"): the comments new since a window opened, still there and their thread still open, and of those, the
// ones each person's setting asks for. Pure: the room reads the threads and the people, this decides.
import type { NoticeSettingDto } from '@livedoc/api-schema';
import {
  drawnMentions,
  threadAssignment,
  type TextDocumentComment,
  type TextDocumentThread,
} from '@livedoc/text-documents';

/** A comment new in a window, as the live state holds it. */
export type RawNotice = {
  readonly tabId: string;
  readonly thread: TextDocumentThread;
  readonly comment: TextDocumentComment;
};

/** A new comment with its people turned into accounts: what an email says of it, and whom it involves. */
export type NoticeComment = {
  readonly tabId: string;
  readonly threadId: string;
  readonly quote: string;
  readonly commentId: string;
  readonly text: string;
  readonly at: number;
  readonly authorName: string;
  /** The author's account, null when their key matches no one the document knows. */
  readonly authorId: string | null;
  /** The accounts this comment mentions or assigns: emailed at once, so left out of their batch. */
  readonly namedIds: ReadonlySet<string>;
  /** Everyone the thread involves (review.md "Comments for you"): its authors, its mentions, its assignee. */
  readonly involved: ReadonlySet<string>;
};

/** The comments of `threads` not among `before` (the ids the tab held as its window opened), on open threads. */
export function newCommentsSince(
  tabId: string,
  threads: readonly TextDocumentThread[],
  before: ReadonlySet<string>,
): RawNotice[] {
  return threads.flatMap((thread) =>
    thread.resolved
      ? []
      : thread.comments
          .filter((comment) => !before.has(comment.id))
          .map((comment) => ({ tabId, thread, comment })),
  );
}

/** Every author key the new comments' threads carry: the keys the room turns into accounts. */
export function noticeKeys(notices: readonly RawNotice[]): Set<string> {
  const keys = new Set<string>();
  for (const { thread } of notices)
    for (const comment of thread.comments) if (comment.author.key) keys.add(comment.author.key);
  return keys;
}

const accountsOf = (mentions: TextDocumentComment['mentions']): string[] =>
  drawnMentions(mentions).flatMap((m) => (m.userId ? [m.userId] : []));

/** The new comments with their authors' keys turned into accounts through `owners`. */
export function noticeComments(
  notices: readonly RawNotice[],
  owners: ReadonlyMap<string, string>,
): NoticeComment[] {
  const ownerOf = (comment: TextDocumentComment) =>
    comment.author.key ? (owners.get(comment.author.key) ?? null) : null;
  return notices.map(({ tabId, thread, comment }) => {
    const involved = new Set<string>();
    for (const c of thread.comments) {
      const owner = ownerOf(c);
      if (owner) involved.add(owner);
      for (const id of accountsOf(c.mentions)) involved.add(id);
    }
    const assignee = threadAssignment(thread)?.assignee.userId;
    if (assignee) involved.add(assignee);
    return {
      tabId,
      threadId: thread.id,
      quote: thread.quote,
      commentId: comment.id,
      text: comment.text,
      at: comment.at,
      authorName: comment.author.name,
      authorId: ownerOf(comment),
      namedIds: new Set([...accountsOf(comment.mentions), ...accountsOf([comment.assignee])]),
      involved,
    };
  });
}

/** Who might hear of them: everyone the threads involve, and everyone who asked for all comments. */
export function noticeCandidates(
  notices: readonly NoticeComment[],
  settings: readonly (NoticeSettingDto & { readonly ownerId: string })[],
): string[] {
  const people = new Set<string>();
  for (const notice of notices) for (const id of notice.involved) people.add(id);
  for (const s of settings) if (s.comments === 'all') people.add(s.ownerId);
  return [...people].sort();
}

/** The comments one person's setting asks for, oldest first: never their own, nor one that named them. */
export function commentsFor(
  personId: string,
  setting: NoticeSettingDto,
  notices: readonly NoticeComment[],
): NoticeComment[] {
  if (setting.comments === 'none') return [];
  return notices
    .filter(
      (n) =>
        n.authorId !== personId &&
        !n.namedIds.has(personId) &&
        (setting.comments === 'all' || n.involved.has(personId)),
    )
    .sort((a, b) => a.at - b.at || a.commentId.localeCompare(b.commentId));
}

/** The telemetry bucket of an email's count of comments (review.md "Telemetry"). */
export function commentCountBucket(count: number): 'One' | 'TwoToFive' | 'SixPlus' {
  if (count <= 1) return 'One';
  return count <= 5 ? 'TwoToFive' : 'SixPlus';
}

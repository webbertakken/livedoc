// The comments panel's filters (docs/specs/012-collaboration/review-surfaces.md "The comments panel"): a kind hands
// the panel its threads as rows; whose (all, or for you), which (all, open, resolved) and the kind's own group (a
// document tab) narrow them, keeping their order. Pure, so every office kind reads the filters alike.
import type { Comment, CommentMention } from '@livedoc/document';

/** A thread as the comments panel lists it. `group` is what the kind's own filter reads (a document tab's id). */
export type ReviewThreadRow = {
  readonly id: string;
  /** The anchor's words (a stretch's quote); empty where it has none, as a point comment. */
  readonly label: string;
  /** Its anchor is gone ("Original content deleted"). */
  readonly deleted: boolean;
  readonly resolved: boolean;
  readonly group: string;
  /** Its comments, oldest first; `authorId` is the author's key, absent for a file's comment. */
  readonly comments: readonly Comment[];
  /** Whom the thread is assigned to (review.md "Assigning"); none where it is not. */
  readonly assignee?: CommentMention | null;
};

export type ReviewWho = 'all' | 'for-you';
export type ReviewState = 'all' | 'open' | 'resolved';

export type ReviewFilters = {
  readonly who: ReviewWho;
  readonly state: ReviewState;
  /** One group's id, or null for every group. */
  readonly group: string | null;
};

export const ReviewFilters = {
  initial: { who: 'all', state: 'all', group: null } as ReviewFilters,
} as const;

/** Who reads the panel: the key their comments carry ('' without one) and their account (null without one). */
export type ReviewSelf = { readonly key: string; readonly userId: string | null };

/** A thread mentions you, or is assigned to you: one of its comments names your account. */
const mentionsYou = (row: ReviewThreadRow, userId: string | null): boolean =>
  userId !== null &&
  (row.assignee?.userId === userId ||
    row.comments.some((c) => c.mentions?.some((m) => m.userId === userId)));

/** A thread for you: another wrote in it after a comment of yours, or it mentions you or is assigned to you. */
export function forYou(row: ReviewThreadRow, self: ReviewSelf): boolean {
  if (mentionsYou(row, self.userId)) return true;
  if (self.key === '') return false;
  const first = row.comments.findIndex((c) => c.authorId === self.key);
  return first >= 0 && row.comments.slice(first + 1).some((c) => c.authorId !== self.key);
}

/** The rows the filters let through, in the order given. */
export function filterRows(
  rows: readonly ReviewThreadRow[],
  filters: ReviewFilters,
  self: ReviewSelf,
): ReviewThreadRow[] {
  return rows.filter(
    (row) =>
      (filters.state === 'all' || row.resolved === (filters.state === 'resolved')) &&
      (filters.group === null || row.group === filters.group) &&
      (filters.who === 'all' || forYou(row, self)),
  );
}

/** A row's replies in words: none, "1 reply", "<n> replies". */
export const repliesLabel = (replies: number): string =>
  replies === 0 ? '' : replies === 1 ? '1 reply' : `${replies} replies`;

/** What the panel says it lists. */
export const countLabel = (count: number): string =>
  count === 1 ? '1 comment' : `${count} comments`;

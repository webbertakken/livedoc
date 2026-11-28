// An office document's comments as the shared review surfaces draw them (docs/specs/034-text-documents/review.md "The
// comments panel", "Threads in the margin"; docs/specs/029-sheets/review.md "Comments"): each comment in the shared
// shape, with "From the file" under a file's author, and a thread's assignee. A text document's and a spreadsheet's
// threads hold the same comments.
import {
  drawnMentions,
  threadAssignment,
  type Comment,
  type CommentMention,
  type OfficeComment,
} from '@livedoc/document';

/** A thread's assignee: its latest comment's that carries one well formed, else none (review.md "Assigning"). */
export const threadAssignee = (thread: {
  readonly comments: readonly OfficeComment[];
}): CommentMention | null => threadAssignment(thread)?.assignee ?? null;

/** A comment in the shared shape; its author's key is the shape's author id. */
export const sharedComment = (c: OfficeComment): Comment & { fromFile?: true } => {
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

export type NotedAuthor = { readonly fromFile?: true; readonly fromComparison?: true };

/** The line under an author with no LiveDoc person behind it: a file's, or a comparison's (review.md "Suggestion cards"). */
export const authorNoteOf = (author: NotedAuthor): string | null =>
  author.fromComparison ? FROM_THE_COMPARISON : author.fromFile ? FROM_THE_FILE : null;

/** The line under a comment's author: "From the file" or "From the comparison", else none. */
export const commentNoteOf = (c: Comment): string | null => authorNoteOf(c as NotedAuthor);

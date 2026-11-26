// An assigned comment (docs/specs/034-text-documents/review.md "Assigning"): the line its thread leads with, the
// composer's offer to assign or reassign.
import type { CommentMention } from '@livedoc/document';

/** Whether two mentions name one person: by account where both have one, else membership, else handle. */
const samePerson = (a: CommentMention, b: CommentMention): boolean =>
  a.userId && b.userId
    ? a.userId === b.userId
    : a.memberId && b.memberId
      ? a.memberId === b.memberId
      : a.handle === b.handle;

/** "Assigned to <name>", or "Assigned to you" for the reader's own account. */
export const assignedLabel = (assignee: CommentMention, selfUserId: string | null): string =>
  selfUserId !== null && assignee.userId === selfUserId
    ? 'Assigned to you'
    : `Assigned to ${assignee.name}`;

/** The composer's offer for a thread assigned to `current`: Assign, Reassign, or none for whom it is assigned to. */
export const assignOffer =
  (current: CommentMention | null) =>
  (mention: CommentMention): string | null =>
    !current
      ? `Assign to ${mention.name}`
      : samePerson(current, mention)
        ? null
        : `Reassign to ${mention.name}`;


// An assigned comment (docs/specs/034-text-documents/review.md "Assigning"): the line its thread leads with, the
// composer's offer to assign or reassign, and the action name its email carries (assigned-actions.md §4).
import type { CommentMention } from '@livedoc/document';

/** The most an assigned action's name holds, as the notify route takes it (assigned-actions.md §4). */
export const ACTION_NAME_MAX = 200;

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

/** An assigned comment's action name: its first line, cut at a word to `ACTION_NAME_MAX` with an ellipsis. */
export function actionNameOf(text: string): string {
  const line = text.split(/\r?\n/)[0]!.trim();
  if (line.length <= ACTION_NAME_MAX) return line;
  const room = line.slice(0, ACTION_NAME_MAX - 1);
  const space = room.lastIndexOf(' ');
  return `${(space > 0 ? room.slice(0, space) : room).trimEnd()}…`;
}

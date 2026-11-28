// What a text document's comment threads put in the collaboration index (docs/specs/013-workspace/inbox.md §2.7): a
// row per thread with a comment, and an action row per thread a comment assigns (review.md "Assigning"). Pure, built
// from the threads the live state holds when the tab's push refreshes its digest. Authors stay adder keys here: the
// api turns them into the identities they were made from, which only it can.
import { cutAtWord, officeCollabRows, type CollabIndexRows } from '@livedoc/document';
import type { TextDocumentThread } from './live-threads';

export { drawnMentions, threadAssignment } from '@livedoc/document';

/** The longest label a thread's row carries (inbox.md D231). */
export const INBOX_QUOTE_MAX = 100;

/** What a thread on no text is called in a row (inbox.md D231). */
const POINT_LABEL = 'Comment';

/** A thread's row label: its quote on one line, cut at a word, or "Comment" for a comment on no text. */
export function threadLabel(quote: string): string {
  const line = quote.replace(/\s+/g, ' ').trim();
  return line ? cutAtWord(line, INBOX_QUOTE_MAX) : POINT_LABEL;
}

/** The rows the threads make, their authors as adder keys; `teamId` the document's team, for the action rows. */
export function textDocumentCollabRows(
  threads: readonly TextDocumentThread[],
  teamId: string | null,
): CollabIndexRows {
  return officeCollabRows(
    threads.map((t) => ({ ...t, label: threadLabel(t.quote) })),
    teamId,
  );
}

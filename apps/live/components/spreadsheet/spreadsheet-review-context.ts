'use client';

// Who comments on a spreadsheet in this session, and where a mention or an assignment is told (docs/specs/029-sheets/
// review.md "Comments", "Who may do what", D655, D656): an Editor or a Participant signs with the key the room ticket
// carries; a Viewer and a spreadsheet in This Browser comment on nothing. The host reads the session; the surface reads
// this.
import type { CommentMention } from '@livedoc/document';
import { createContext, useContext } from 'react';
import type { OfficeCommenter } from '@/lib/office/review/office-commenter';

export type SpreadsheetReview = {
  readonly commenter: OfficeCommenter | null;
  /** The spreadsheet is in This Browser: Insert › Comment is dimmed with a hint to sync (D656). */
  readonly local: boolean;
  /** The reader's account, so a thread assigned to them reads "Assigned to you". */
  readonly selfUserId: string | null;
  /** A comment with mentions was added: count it and ask for the email (034 review.md "Mentions"). */
  readonly onMentioned?: (text: string, mentions: readonly CommentMention[]) => void;
  /** A comment that assigns its thread was added: ask for the assignee's email (034 review.md "Assigning"). */
  readonly onAssigned?: (text: string, assignee: CommentMention) => void;
  /** A thread an Inbox row asked this sheet to go to (inbox.md §1.8); `n` tells one ask from the next. */
  readonly arrival?: { readonly threadId: string; readonly n: number } | null;
};

export const NO_REVIEW: SpreadsheetReview = { commenter: null, local: false, selfUserId: null };

export const SpreadsheetReviewContext = createContext<SpreadsheetReview>(NO_REVIEW);

export function useSpreadsheetReview(): SpreadsheetReview {
  return useContext(SpreadsheetReviewContext);
}

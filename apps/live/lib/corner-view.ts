import { closeAsk } from '@/lib/ask-view';
import { closeReview } from '@/lib/review-view';
import { setSuggestionsPanelOpen } from '@/lib/suggestion-view';

// The corner of an Event Storming board holds one thing open at a time
// (docs/specs/021-event-storming/board-review.md "The panel"): the Ask popover, the suggestions list or the Review
// panel. Whatever opens one makes room for it here first, so the three views know nothing of each other.

export type CornerPart = 'ask' | 'list' | 'review';

/** Close what else stands open in this board's corner, for the part about to open. */
export function clearCornerFor(tabId: string, opening: CornerPart): void {
  if (opening !== 'ask') closeAsk(tabId);
  if (opening !== 'list') setSuggestionsPanelOpen(tabId, false);
  if (opening !== 'review') closeReview(tabId);
}

import { clearCornerFor } from '@/lib/corner-view';
import { debugLog } from '@/lib/debug-log';
import { closeReview, openReview, reviewViewFor } from '@/lib/review-view';
import { track } from '@/lib/telemetry';

// Opening and closing the Review panel (docs/specs/021-event-storming/board-review.md "The panel"): the person's own
// view, so the pill, the board's menu and the command palette reach it without the panel's code, which is the Event
// Storming family's (docs/specs/016-platform/web-performance.md).

/** Opens the panel, taking the corner; opening counts once, and says which tab it opened on. */
export function showReview(tabId: string): void {
  if (reviewViewFor(tabId).open) return;
  clearCornerFor(tabId, 'review');
  openReview(tabId);
  track('Canvas', 'Used', 'ReviewOpened');
  debugLog('[review] opened', { tab: reviewViewFor(tabId).tab });
}

/** Opens or closes the panel. */
export function toggleReview(tabId: string): void {
  if (reviewViewFor(tabId).open) closeReview(tabId);
  else showReview(tabId);
}

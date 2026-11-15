import type { Page } from '@playwright/test';
import { REVIEW_BOARD_IDS, reviewBoardElements } from '../lib/review-board.fixture';
import { startSuggestionBoard } from './suggestion-board';

// The review's seeded kitchen in a browser (docs/specs/021-event-storming/board-review.md): the board itself is
// lib/review-board.fixture.ts, shared with the unit tests.
export { REVIEW_BOARD_ANSWER, REVIEW_BOARD_IDS } from '../lib/review-board.fixture';

/** A new Event Storming board holding the kitchen as a review finds it. */
export async function startReviewBoard(page: Page): Promise<void> {
  await startSuggestionBoard(page, reviewBoardElements(), REVIEW_BOARD_IDS.orderTaken);
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetReviewViewForTests, reviewViewFor } from '@/lib/review-view';
import { showReview, toggleReview } from './review-open';

// Opening and closing the Review panel (docs/specs/021-event-storming/board-review.md "The panel").

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));
const debugLog = vi.fn<(...a: unknown[]) => void>();
vi.mock('@/lib/debug-log', () => ({ debugLog: (...a: unknown[]) => debugLog(...a) }));

beforeEach(() => {
  track.mockClear();
  debugLog.mockClear();
});
afterEach(resetReviewViewForTests);

describe('toggleReview', () => {
  it('opens the panel, counting it once and saying the tab, then closes it', () => {
    toggleReview('t');
    expect(reviewViewFor('t').open).toBe(true);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'ReviewOpened');
    expect(debugLog).toHaveBeenCalledWith('[review] opened', { tab: 'check' });
    toggleReview('t');
    expect(reviewViewFor('t').open).toBe(false);
    expect(track).toHaveBeenCalledTimes(1);
  });
});

describe('showReview', () => {
  it('leaves an open panel open, counting nothing more', () => {
    showReview('t');
    showReview('t');
    expect(reviewViewFor('t').open).toBe(true);
    expect(track).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterNextPaint } from './after-next-paint';

// docs/specs/034-text-documents/performance.md "Budgets": work that need not be in a frame runs after its paint.
describe('afterNextPaint', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs after the next frame, never within it', () => {
    const run = vi.fn();
    afterNextPaint(run);
    vi.advanceTimersToNextFrame();
    expect(run).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs nothing once cancelled, before the frame or after it', () => {
    const early = vi.fn();
    afterNextPaint(early)();
    const late = vi.fn();
    const cancel = afterNextPaint(late);
    vi.advanceTimersToNextFrame();
    cancel();
    vi.runAllTimers();
    expect(early).not.toHaveBeenCalled();
    expect(late).not.toHaveBeenCalled();
  });
});

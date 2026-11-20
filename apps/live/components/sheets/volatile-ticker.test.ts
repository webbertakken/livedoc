// formulas.md "Functions", settings.md "Calculation": volatile formulas tick as the document's setting says.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VOLATILE_TICK_HOUR_MS,
  VOLATILE_TICK_MINUTE_MS,
  VolatileTicker,
  volatileTickMs,
} from './volatile-ticker';

describe('volatileTickMs', () => {
  it('ticks a Plan Sheet every minute, and a spreadsheet as its Recalculation says', () => {
    expect(volatileTickMs(false, undefined)).toBe(VOLATILE_TICK_MINUTE_MS);
    expect(volatileTickMs(true, 'change')).toBeNull();
    expect(volatileTickMs(true, undefined)).toBeNull();
    expect(volatileTickMs(true, 'minute')).toBe(VOLATILE_TICK_MINUTE_MS);
    expect(volatileTickMs(true, 'hour')).toBe(VOLATILE_TICK_HOUR_MS);
  });
});

describe('VolatileTicker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function page() {
    const listeners = new Set<() => void>();
    return {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      show() {
        this.visibilityState = 'visible';
        for (const l of listeners) l();
      },
      listeners,
    };
  }

  it('ticks every period while visible, and stops', () => {
    const tick = vi.fn();
    const ticker = new VolatileTicker(tick, page() as never);
    ticker.every(1_000);
    ticker.every(1_000);
    vi.advanceTimersByTime(3_000);
    expect(tick).toHaveBeenCalledTimes(3);
    ticker.every(null);
    vi.advanceTimersByTime(3_000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('holds a tick while the page is hidden, and runs it once as the page shows', () => {
    const tick = vi.fn();
    const p = page();
    const ticker = new VolatileTicker(tick, p as never);
    ticker.every(1_000);
    p.visibilityState = 'hidden';
    vi.advanceTimersByTime(5_000);
    expect(tick).not.toHaveBeenCalled();
    p.show();
    p.show();
    expect(tick).toHaveBeenCalledTimes(1);
    ticker.stop();
    expect(p.listeners.size).toBe(0);
  });

  it('ignores the page showing with nothing missed, and ticks with no page at all', () => {
    const tick = vi.fn();
    const p = page();
    new VolatileTicker(tick, p as never).every(1_000);
    p.show();
    expect(tick).not.toHaveBeenCalled();
    const bare = new VolatileTicker(tick, null);
    bare.every(1_000);
    vi.advanceTimersByTime(1_000);
    expect(tick).toHaveBeenCalledTimes(2);
    bare.stop();
  });
});

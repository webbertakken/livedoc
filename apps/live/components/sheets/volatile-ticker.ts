// How often volatile formulas (`NOW`, `TODAY`, `RAND`, `RANDBETWEEN`) are worked out again with nothing changed
// (docs/specs/029-sheets/formulas.md "Functions", settings.md "Calculation"): a spreadsheet as its Recalculation
// setting says, a Plan Sheet once a minute. Ticks only while the page is visible; a tick missed while hidden runs
// as the page shows again.
import type { WorkbookRecalc } from '@livedoc/sheets';

export const VOLATILE_TICK_MINUTE_MS = 60_000;
export const VOLATILE_TICK_HOUR_MS = 3_600_000;

/** The time between ticks for a document; null when only a change recalculates. */
export function volatileTickMs(
  spreadsheet: boolean,
  recalc: WorkbookRecalc | undefined,
): number | null {
  if (!spreadsheet) return VOLATILE_TICK_MINUTE_MS;
  if (recalc === 'minute') return VOLATILE_TICK_MINUTE_MS;
  if (recalc === 'hour') return VOLATILE_TICK_HOUR_MS;
  return null;
}

type Page = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

export class VolatileTicker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ms: number | null = null;
  private missed = false;
  private readonly tick: () => void;
  private readonly page: Page | null;

  constructor(tick: () => void, page: Page | null) {
    this.tick = tick;
    this.page = page;
  }

  /** Tick every `ms`, or not at all (null); the same period again changes nothing. */
  every(ms: number | null): void {
    if (ms === this.ms) return;
    this.stop();
    this.ms = ms;
    if (ms === null) return;
    this.timer = setInterval(this.fire, ms);
    this.page?.addEventListener('visibilitychange', this.shown);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.page?.removeEventListener('visibilitychange', this.shown);
    this.timer = null;
    this.ms = null;
    this.missed = false;
  }

  private readonly fire = (): void => {
    if (this.page?.visibilityState === 'hidden') {
      this.missed = true;
      return;
    }
    this.tick();
  };

  private readonly shown = (): void => {
    if (!this.missed || this.page?.visibilityState === 'hidden') return;
    this.missed = false;
    this.tick();
  };
}

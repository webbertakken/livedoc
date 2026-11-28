// @vitest-environment jsdom
// docs/specs/029-sheets/plan-links.md "The `CARD` functions", D509: the cards' document is asked at once and every
// ten seconds while the page is shown; an unchanged answer lands nothing, a refusal lands no access.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARDS_DENIED } from '@livedoc/sheets';
import type { PlanCardsAnswer } from '@/lib/api/plan-cards';
import { CARDS_REFRESH_MS, watchSpreadsheetCards } from './spreadsheet-cards';

const read = (version: string): PlanCardsAnswer => ({
  kind: 'read',
  cards: { items: [], types: [], statusNames: new Map() },
  version,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('watchSpreadsheetCards', () => {
  it('lands the cards, asks again on a tick, and lands only a changed answer', async () => {
    const answers = [read('1:0:'), read('1:0:'), read('2:0:')];
    const fetch = vi.fn(async () => answers.shift()!);
    const land = vi.fn();
    const stop = watchSpreadsheetCards({ ownerId: 'o', documentId: 'plan', land, fetch });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledWith('o', 'plan');
    expect(land).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CARDS_REFRESH_MS);
    expect(land).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CARDS_REFRESH_MS);
    expect(land).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(CARDS_REFRESH_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('lands no access for a refusal', async () => {
    const land = vi.fn();
    watchSpreadsheetCards({
      ownerId: 'o',
      documentId: 'plan',
      land,
      fetch: async () => ({ kind: 'denied' }),
    })();
    await vi.advanceTimersByTimeAsync(0);
    expect(land).not.toHaveBeenCalled();
    const stop = watchSpreadsheetCards({
      ownerId: 'o',
      documentId: 'plan',
      land,
      fetch: async () => ({ kind: 'denied' }),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(land).toHaveBeenCalledWith({ unavailable: CARDS_DENIED });
    stop();
  });

  it('keeps what it landed when an ask fails, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = vi
      .fn<(o: string, d: string) => Promise<PlanCardsAnswer>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(read('1:0:'));
    const land = vi.fn();
    const stop = watchSpreadsheetCards({ ownerId: 'o', documentId: 'plan', land, fetch });
    await vi.advanceTimersByTimeAsync(0);
    expect(land).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[sheets] cards read failed', {
      documentId: 'plan',
      error: 'Error: offline',
    });
    await vi.advanceTimersByTimeAsync(CARDS_REFRESH_MS);
    expect(land).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not ask while the page is hidden', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const fetch = vi.fn(async () => read('1:0:'));
    const stop = watchSpreadsheetCards({ ownerId: 'o', documentId: 'p', land: vi.fn(), fetch });
    await vi.advanceTimersByTimeAsync(CARDS_REFRESH_MS * 2);
    expect(fetch).toHaveBeenCalledTimes(1);
    stop();
  });
});

// The page's fetching of imports (docs/specs/029-sheets/imports.md "Fetching"): a few at once, each answer landed with
// the scope that asked, and a spent rate asked again after its wait.
import { describe, expect, it, vi } from 'vitest';
import type { ImportAnswer, ImportAsk } from '@livedoc/sheets';
import { IMPORTS_AT_ONCE, IMPORT_RETRY_MS, SheetImports } from './sheet-imports';

const ask = (i: number): ImportAsk => ({
  key: `k${i}`,
  request: { kind: 'data', url: `https://a.example/${i}` },
  fresh: false,
});
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('SheetImports', () => {
  it('fetches a few at once and lands each answer with its scope', async () => {
    const pending: ((a: ImportAnswer) => void)[] = [];
    const landed: [string, string][] = [];
    const imports = new SheetImports({
      fetch: () => new Promise((resolve) => pending.push(resolve)),
      land: (scope, key) => landed.push([scope, key]),
    });
    imports.take('*', [1, 2, 3, 4, 5, 6].map(ask));
    expect(pending).toHaveLength(IMPORTS_AT_ONCE);
    pending[0]!({ rows: [['x']] });
    await settle();
    expect(landed).toEqual([['*', 'k1']]);
    expect(pending).toHaveLength(IMPORTS_AT_ONCE + 1);
  });

  it('asks again after a wait when the rate is spent', async () => {
    const waits: number[] = [];
    const answers: (ImportAnswer | 'later')[] = ['later', { rows: [['x']] }];
    const fetch = vi.fn(async () => answers.shift()!);
    const land = vi.fn();
    const imports = new SheetImports({ fetch, land, wait: async (ms) => void waits.push(ms) });
    imports.take('*', [ask(1)]);
    await settle();
    expect(waits).toEqual([IMPORT_RETRY_MS]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(land).toHaveBeenCalledWith('*', 'k1', { rows: [['x']] });
  });

  it('waits with a timer when given no wait', async () => {
    vi.useFakeTimers();
    try {
      const answers: (ImportAnswer | 'later')[] = ['later', { rows: [] }];
      const fetch = vi.fn(async () => answers.shift()!);
      new SheetImports({ fetch, land: vi.fn() }).take('*', [ask(1)]);
      await vi.advanceTimersByTimeAsync(IMPORT_RETRY_MS);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

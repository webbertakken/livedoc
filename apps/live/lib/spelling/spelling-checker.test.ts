import { describe, expect, it, vi } from 'vitest';
import { createSpellingChecker, SPELLING_CACHE_MAX, type SpellingWorker } from './spelling-checker';
import type { SpellingRequest, SpellingResponse } from './spelling-protocol';

// A worker that knows "the" and "cat", suggests "the" for anything, and fails while `failing` is set.
function fakeWorker() {
  const seen: SpellingRequest[] = [];
  let listener: (e: MessageEvent<SpellingResponse>) => void = () => {};
  const state = { failing: false };
  const worker: SpellingWorker = {
    postMessage: (request) => {
      seen.push(request);
      const answer: SpellingResponse = state.failing
        ? { id: request.id, kind: 'failed', error: 'load-failed', detail: 'nl: offline' }
        : request.kind === 'check'
          ? {
              id: request.id,
              kind: 'checked',
              misspelt: request.words.filter((w) => !['the', 'cat'].includes(w)),
            }
          : { id: request.id, kind: 'suggested', suggestions: ['the'].slice(0, request.most) };
      queueMicrotask(() => listener({ data: answer } as MessageEvent<SpellingResponse>));
    },
    addEventListener: (_, fn) => (listener = fn),
  };
  return { worker, seen, state };
}

describe('createSpellingChecker', () => {
  it('makes its worker on the first request only', async () => {
    const { worker } = fakeWorker();
    const make = vi.fn(() => worker);
    const checker = createSpellingChecker(make);
    expect(make).not.toHaveBeenCalled();
    await checker.check('nl', ['teh']);
    await checker.check('nl', ['cat']);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('names the misspelt words, asking only about words it has not heard of', async () => {
    const { worker, seen } = fakeWorker();
    const checker = createSpellingChecker(() => worker);
    expect([...(await checker.check('nl', ['the', 'teh', 'teh']))]).toEqual(['teh']);
    expect([...(await checker.check('nl', ['teh', 'cat']))]).toEqual(['teh']);
    expect(seen.map((r) => r.kind === 'check' && r.words)).toEqual([['the', 'teh'], ['cat']]);
    expect(await checker.check('nl', ['the'])).toEqual(new Set());
    expect(seen).toHaveLength(2);
    // Another language is asked again.
    await checker.check('fr', ['the']);
    expect(seen).toHaveLength(3);
  });

  it('answers what is known at once', () => {
    const { worker } = fakeWorker();
    const checker = createSpellingChecker(() => worker);
    expect(checker.known('nl', 'teh')).toBeUndefined();
    return checker.check('nl', ['teh', 'the']).then(() => {
      expect(checker.known('nl', 'teh')).toBe(false);
      expect(checker.known('nl', 'the')).toBe(true);
    });
  });

  it('forgets every verdict past the cache’s limit', async () => {
    const { worker, seen } = fakeWorker();
    const checker = createSpellingChecker(() => worker);
    await checker.check(
      'nl',
      Array.from({ length: SPELLING_CACHE_MAX }, (_, i) => `w${i}`),
    );
    // The words it knew still count in the answer that clears them.
    expect(await checker.check('nl', ['w1', 'one-more', 'the'])).toEqual(
      new Set(['w1', 'one-more']),
    );
    await checker.check('nl', ['w0']);
    expect(seen).toHaveLength(3);
  });

  it('suggests, keeping each word’s answer', async () => {
    const { worker, seen } = fakeWorker();
    const checker = createSpellingChecker(() => worker);
    expect(await checker.suggest('nl', 'teh')).toEqual(['the']);
    expect(await checker.suggest('nl', 'teh')).toEqual(['the']);
    expect(seen).toHaveLength(1);
  });

  it('underlines nothing and suggests nothing when the worker fails, then asks again', async () => {
    const { worker, state } = fakeWorker();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const checker = createSpellingChecker(() => worker);
    state.failing = true;
    expect(await checker.check('nl', ['teh'])).toEqual(new Set());
    expect(await checker.suggest('nl', 'teh')).toEqual([]);
    expect(warn).toHaveBeenCalledWith('[spelling] check failed', {
      error: 'load-failed',
      detail: 'nl: offline',
    });
    state.failing = false;
    expect(await checker.check('nl', ['teh'])).toEqual(new Set(['teh']));
    warn.mockRestore();
  });

  it('underlines nothing where no worker can start', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const checker = createSpellingChecker(() => {
      throw new Error('blocked');
    });
    expect(await checker.check('nl', ['teh'])).toEqual(new Set());
    expect(warn).toHaveBeenCalledWith('[spelling] worker refused', { detail: 'Error: blocked' });
    warn.mockRestore();
  });
});

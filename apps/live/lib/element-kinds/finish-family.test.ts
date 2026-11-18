import { afterEach, describe, expect, it, vi } from 'vitest';

let settle: { resolve: (m: unknown) => void; reject: (e: unknown) => void } | null = null;
const calls: string[] = [];
vi.mock('./families', () => ({
  KIND_FAMILY_LOADERS: {
    sketches: () => {
      calls.push('sketches');
      return new Promise((resolve, reject) => (settle = { resolve, reject }));
    },
  },
  KIND_FAMILY_IDS: ['sketches'],
}));

const { prefetchFinishFamily, withFinishFamily } = await import('./finish-family');
const { resetKindFamiliesForTests, setKindFamilyFailureHandler } = await import('./store');

afterEach(() => {
  resetKindFamiliesForTests();
  settle = null;
  calls.length = 0;
});

// docs/specs/016-platform/web-performance.md "From the palette": a hand-drawn finish applies once its family is in.
describe('withFinishFamily', () => {
  it('applies a finish of no family at once', () => {
    const apply = vi.fn();
    withFinishFamily('professional', apply);
    withFinishFamily(null, apply);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([]);
  });

  it('applies a hand-drawn finish once the sketches family lands, and at once after', async () => {
    const apply = vi.fn();
    withFinishFamily('sketch', apply);
    expect(apply).not.toHaveBeenCalled();
    settle!.resolve({});
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    withFinishFamily('marker', apply);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('applies nothing when the family cannot load', async () => {
    setKindFamilyFailureHandler(() => {});
    const apply = vi.fn();
    withFinishFamily('marker', apply);
    settle!.reject(new Error('offline'));
    await vi.waitFor(() => expect(calls).toEqual(['sketches']));
    await new Promise((r) => setTimeout(r, 0));
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('prefetchFinishFamily', () => {
  it('fetches the family of a hand-drawn finish only', () => {
    prefetchFinishFamily('flexible');
    expect(calls).toEqual([]);
    prefetchFinishFamily('sketch');
    expect(calls).toEqual(['sketches']);
  });
});

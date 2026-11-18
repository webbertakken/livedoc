import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// docs/specs/016-platform/web-performance.md "An element kind's code loads with the board that holds it": turning a
// shape into a mind node waits for the mind maps family, as a palette press does. The family's loader is a promise
// the test settles.
let settleLoad: { resolve: (m: unknown) => void; reject: (e: unknown) => void } | null = null;
vi.mock('@/lib/element-kinds/families', () => ({
  KIND_FAMILY_LOADERS: {
    'mind-maps': () =>
      new Promise((resolve, reject) => {
        settleLoad = { resolve, reject };
      }),
  },
  KIND_FAMILY_IDS: ['mind-maps'],
}));

const { morphWhenReady } = await import('./shape-morph');
const { resetKindFamiliesForTests } = await import('@/lib/element-kinds/store');
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  settleLoad = null;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  resetKindFamiliesForTests();
  vi.restoreAllMocks();
});

describe('morphWhenReady', () => {
  it('morphs into a base kind at once, asking for no family', () => {
    const morph = vi.fn();
    morphWhenReady('circle', morph);
    expect(morph).toHaveBeenCalledOnce();
    expect(settleLoad).toBeNull();
  });

  it('morphs into a mind node once the mind maps family is in', async () => {
    const morph = vi.fn();
    morphWhenReady('mind-node', morph);
    expect(morph).not.toHaveBeenCalled();
    settleLoad!.resolve({});
    await settle();
    expect(morph).toHaveBeenCalledOnce();
  });

  it('morphs into a mind node at once when the family is already in', async () => {
    morphWhenReady('mind-node', () => {});
    settleLoad!.resolve({});
    await settle();
    const morph = vi.fn();
    morphWhenReady('mind-node', morph);
    expect(morph).toHaveBeenCalledOnce();
  });

  it('morphs nothing when the family cannot load', async () => {
    const morph = vi.fn();
    morphWhenReady('mind-node', morph);
    settleLoad!.reject(new Error('offline'));
    await settle();
    expect(morph).not.toHaveBeenCalled();
  });
});

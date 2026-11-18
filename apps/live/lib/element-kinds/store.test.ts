import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each family's loader is a promise the test settles, so every state is reached on purpose.
const pending = new Map<string, { resolve: (m: unknown) => void; reject: (e: unknown) => void }>();
const calls: string[] = [];
const loader = (id: string) => () => {
  calls.push(id);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
vi.mock('./families', () => ({
  KIND_FAMILY_LOADERS: { concepts: loader('concepts'), embeds: loader('embeds') },
  KIND_FAMILY_IDS: ['concepts', 'embeds'],
}));

const {
  KIND_FAMILY_PREFETCH,
  KindFamilyNotLoaded,
  failedKindFamilies,
  isKindFamilyLoaded,
  loadKindFamily,
  requireKindFamily,
  resetKindFamiliesForTests,
  retryFailedKindFamilies,
  setKindFamilyFailureHandler,
  subscribeKindFamilies,
} = await import('./store');

const CONCEPTS = { ConceptFace: () => null };
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  pending.clear();
  calls.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  resetKindFamiliesForTests();
  vi.restoreAllMocks();
});

describe('the kind families store', () => {
  it('asks once for a family asked for from several places at the same time', async () => {
    const a = loadKindFamily('concepts', 'open');
    const b = loadKindFamily('concepts', 'tab');
    expect(calls).toEqual(['concepts']);
    pending.get('concepts')!.resolve(CONCEPTS);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
  });

  it('holds a family in for the page once it lands, and hands its module over', async () => {
    const run = loadKindFamily('concepts', 'open');
    expect(isKindFamilyLoaded('concepts')).toBe(false);
    pending.get('concepts')!.resolve(CONCEPTS);
    await run;
    expect(isKindFamilyLoaded('concepts')).toBe(true);
    expect(requireKindFamily('concepts')).toBe(CONCEPTS);
    expect(await loadKindFamily('concepts', 'palette')).toBe(true);
    expect(calls).toEqual(['concepts']);
  });

  it('refuses a family that is not in with a named error', () => {
    expect(() => requireKindFamily('embeds')).toThrow(KindFamilyNotLoaded);
    try {
      requireKindFamily('embeds');
    } catch (error) {
      expect((error as InstanceType<typeof KindFamilyNotLoaded>).family).toBe('embeds');
      expect((error as Error).name).toBe('KindFamilyNotLoaded');
      expect((error as Error).message).toBe('Kind family embeds is not loaded');
    }
  });

  it('shows a needed load that fails, hands it to the safety net, and retries it', async () => {
    const onFailure = vi.fn();
    setKindFamilyFailureHandler(onFailure);
    const error = new Error('Loading chunk 7 failed.');
    const run = loadKindFamily('embeds', 'element');
    pending.get('embeds')!.reject(error);
    expect(await run).toBe(false);
    expect(failedKindFamilies()).toEqual(['embeds']);
    expect(onFailure).toHaveBeenCalledWith(error, 'embeds');
    expect(console.warn).toHaveBeenCalled();

    const retry = retryFailedKindFamilies();
    pending.get('embeds')!.resolve({});
    await retry;
    expect(failedKindFamilies()).toEqual([]);
    expect(isKindFamilyLoaded('embeds')).toBe(true);
  });

  it('forgets an idle prefetch that fails', async () => {
    const onFailure = vi.fn();
    setKindFamilyFailureHandler(onFailure);
    const run = loadKindFamily('embeds', 'idle');
    pending.get('embeds')!.reject(new Error('offline'));
    expect(await run).toBe(false);
    expect(failedKindFamilies()).toEqual([]);
    expect(onFailure).not.toHaveBeenCalled();
    // Asked again, it is asked again.
    void loadKindFamily('embeds', 'element');
    expect(calls).toEqual(['embeds', 'embeds']);
  });

  it('shows an idle prefetch that fails once something waits on it', async () => {
    const run = loadKindFamily('embeds', 'idle');
    void loadKindFamily('embeds', 'palette');
    pending.get('embeds')!.reject(new Error('offline'));
    await run;
    expect(failedKindFamilies()).toEqual(['embeds']);
  });

  it('tells its listeners when a family lands or fails, until they leave', async () => {
    const listener = vi.fn();
    const leave = subscribeKindFamilies(listener);
    const run = loadKindFamily('concepts', 'open');
    pending.get('concepts')!.resolve(CONCEPTS);
    await run;
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
    leave();
    const fail = loadKindFamily('embeds', 'open');
    pending.get('embeds')!.reject(new Error('x'));
    await fail;
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps the failed list the same array until it changes', async () => {
    const before = failedKindFamilies();
    expect(failedKindFamilies()).toBe(before);
    const run = loadKindFamily('embeds', 'open');
    pending.get('embeds')!.reject(new Error('x'));
    await run;
    const after = failedKindFamilies();
    expect(after).not.toBe(before);
    expect(failedKindFamilies()).toBe(after);
  });

  it('prefetches every family, one stable loader each, as idle', async () => {
    expect(KIND_FAMILY_PREFETCH).toHaveLength(2);
    const run = KIND_FAMILY_PREFETCH[1]!();
    expect(calls).toEqual(['embeds']);
    pending.get('embeds')!.reject(new Error('offline'));
    await run;
    expect(failedKindFamilies()).toEqual([]);
  });
});

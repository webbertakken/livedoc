import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Element } from '@livedoc/document';

const asked: [string, string][] = [];
const outcome = new Map<string, boolean>();
vi.mock('./store', () => ({
  loadKindFamily: vi.fn(async (id: string, reason: string) => {
    asked.push([id, reason]);
    return outcome.get(id) ?? true;
  }),
}));
const apiLoadTabRevisioned = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiLoadTabRevisioned: (...args: unknown[]) => apiLoadTabRevisioned(...args),
}));

const { loadKindFamiliesFor } = await import('./load-for');
const { loadTabWithKindFamilies } = await import('./load-tab');

const el = (value: object) => value as Element;

afterEach(() => {
  asked.length = 0;
  outcome.clear();
  apiLoadTabRevisioned.mockReset();
});

describe('loadKindFamiliesFor', () => {
  it('asks for every family the elements need, with the reason', async () => {
    await loadKindFamiliesFor(
      [el({ type: 'video' }), el({ type: 'shape', shape: 'agenda' }), el({ type: 'text' })],
      'open',
    );
    expect(asked).toEqual([
      ['embeds', 'open'],
      ['collab-panels', 'open'],
    ]);
  });

  it('settles when a family fails, so the board still opens', async () => {
    outcome.set('embeds', false);
    await expect(loadKindFamiliesFor([el({ type: 'video' })], 'tab')).resolves.toBeUndefined();
  });

  it('asks nothing for a board of base kinds', async () => {
    await loadKindFamiliesFor([el({ type: 'text' })], 'tab');
    expect(asked).toEqual([]);
  });
});

describe('loadTabWithKindFamilies', () => {
  it('answers a tab once its families are in', async () => {
    const tab = { id: 't', name: 'T', elements: [el({ type: 'shape', shape: 'reveal' })] };
    apiLoadTabRevisioned.mockResolvedValue({ tab, rev: 3 });
    await expect(loadTabWithKindFamilies('me', 'doc', 't', null)).resolves.toEqual({ tab, rev: 3 });
    expect(apiLoadTabRevisioned).toHaveBeenCalledWith('me', 'doc', 't', null);
    expect(asked).toEqual([['session-controls', 'tab']]);
  });

  it('answers a missing tab as the read did', async () => {
    apiLoadTabRevisioned.mockResolvedValue(null);
    await expect(loadTabWithKindFamilies('me', 'doc', 't', 'code')).resolves.toBeNull();
    expect(asked).toEqual([]);
  });
});

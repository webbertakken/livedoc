// docs/specs/029-sheets/plan-links.md "The `CARD` functions": a spreadsheet reads its cards' document with the reader's
// own access: its items, and its card types and column names from its plan; a refusal reads as no access.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPlanCards } from './plan-cards';

const PLAN = {
  boards: [],
  statuses: [{ status: 'done', name: 'Shipped' }],
  types: [{ id: 'task', label: 'Task' }],
  itemTypesRev: 4,
};
const ITEMS = { items: [{ id: 'i1', key: 1 }], rev: 9 };

function answer(
  plan: { body: unknown; status?: number },
  items: { body: unknown; status?: number },
) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const one = url.endsWith('/plan') ? plan : items;
    return new Response(JSON.stringify(one.body), { status: one.status ?? 200 });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchPlanCards', () => {
  it('reads the items, card types and column names, with a version of all three', async () => {
    const f = answer({ body: PLAN }, { body: ITEMS });
    vi.stubGlobal('fetch', f);
    const read = await fetchPlanCards('o', 'plan 1');
    expect(read).toEqual({
      kind: 'read',
      cards: {
        items: ITEMS.items,
        types: PLAN.types,
        statusNames: new Map([['done', 'Shipped']]),
      },
      version: '9:4:done=Shipped',
    });
    const urls = f.mock.calls.map((c) => c[0]).sort();
    expect(urls[0]).toMatch(/\/documents\/plan%201\/items$/);
    expect(urls[1]).toMatch(/\/documents\/plan%201\/plan$/);
  });

  it.each([403, 404, 410])('reads a %s as no access', async (status) => {
    vi.stubGlobal('fetch', answer({ body: {}, status }, { body: ITEMS }));
    await expect(fetchPlanCards('o', 'p')).resolves.toEqual({ kind: 'denied' });
    vi.stubGlobal('fetch', answer({ body: PLAN }, { body: {}, status }));
    await expect(fetchPlanCards('o', 'p')).resolves.toEqual({ kind: 'denied' });
  });

  it('throws on any other failure', async () => {
    vi.stubGlobal('fetch', answer({ body: {}, status: 500 }, { body: ITEMS }));
    await expect(fetchPlanCards('o', 'p')).rejects.toThrow();
  });
});

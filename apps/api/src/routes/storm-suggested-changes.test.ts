import { afterEach, describe, expect, it, vi } from 'vitest';
import { sentJson } from '@livedoc/vitest-config/sent-request';
import type { Element } from '@livedoc/document';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import type { Env } from '../types';
import { makeTestRouteContext } from './test-route-context';
import { handleDocuments } from './documents';

// Suggested changes end to end through the api (docs/specs/021-event-storming/suggested-changes.md,
// docs/specs/021-event-storming/asks.md "What was declined"): an agent's changeset keeps a name on its context and a
// change on its note, the storm view lists them with what was declined, and a declined suggestion is refused.

const OWNER = 'user_owner';

const note = (id: string, esKind: string, x: number, label: string): Element =>
  ({ id, type: 'sticky', x, y: 0, width: 200, height: 200, label, esKind }) as Element;
const context = (id: string, label: string, notes: string[]): Element => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label,
  esContext: { notes },
});

// A room that holds nothing and answers no selection.
const room = {
  idFromName: (name: string) => name,
  get: () => ({
    fetch: async (input: string | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      if (init?.body) sentJson(init);
      if (url.includes('/selections')) return Response.json({ selections: [] });
      return new Response(null, { status: 204 });
    },
  }),
};

function call(db: SqliteD1, who: 'person' | 'agent', method: string, path: string, body?: unknown) {
  const base = makeTestRouteContext(method, path, {
    env: db.env,
    owner: OWNER,
    sessionAccountId: who === 'person' ? OWNER : null,
    verifiedAccountId: OWNER,
    body,
  });
  return handleDocuments(who === 'agent' ? { ...base, token: { id: 'tok_1' } } : base);
}

async function board(esDeclined?: unknown[]) {
  const db = sqliteD1({ DOCUMENT_ROOM: room } as unknown as Partial<Env>);
  const created = await call(db, 'person', 'POST', '/api/documents', {
    id: 'B',
    name: 'Order flow',
    tabs: [
      {
        id: 'es',
        name: 'Board',
        kind: 'event-storming',
        ...(esDeclined ? { esDeclined } : {}),
        elements: [
          note('placed', 'domain-event', 0, 'Order Placed'),
          note('cooked', 'domain-event', 300, 'Meal Cooked'),
          context('ordering', 'Ordering', ['placed']),
          context('kitchen', 'Kitchen', ['cooked']),
        ],
      },
    ],
  });
  expect(created.status).toBe(201);
  return db;
}

const suggest = (db: SqliteD1, operations: string) =>
  call(db, 'agent', 'POST', '/api/documents/B/tabs/es/changesets', { operations });

const stormView = (db: SqliteD1, query: string) =>
  call(db, 'person', 'GET', `/api/documents/B/tabs/es?${query}`);

afterEach(() => vi.restoreAllMocks());

describe('suggested changes through the api', () => {
  it('keeps what an agent suggests and lists it in the storm view', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await board();
    const res = await suggest(
      db,
      [
        'suggest-reword placed "Booking Placed" term=Order to=Booking reason="their word"',
        'suggest-name "Shop" ordering kitchen',
        'suggest-remove cooked',
      ].join('\n'),
    );
    expect(res.status).toBe(200);

    const text = (await (await stormView(db, 'view=storm')).text()).split('\n');
    expect(text[0]).toContain('3 suggestions');
    expect(text.slice(text.indexOf('suggested changes'))).toEqual([
      'suggested changes',
      // The api names an agent by its token's owner; this one has no name.
      '  ordering,kitchen name "Shop" · by Someone',
      '  placed reword "Booking Placed" (term "Order" -> "Booking") · by Someone: their word',
      '  cooked remove · by Someone',
    ]);

    const body = await (
      await stormView(db, 'view=storm&json=1')
    ).json<{
      changes: { type: string }[];
      declined: unknown[];
      reading: Record<string, unknown>;
    }>();
    expect(body.changes.map((c) => c.type)).toEqual(['name', 'change', 'change']);
    expect(body.declined).toEqual([]);
    // What is suggested is no part of what the board says.
    expect(body.reading).not.toHaveProperty('changes');
  });

  it('refuses what a person dismissed before, and lists it for the agent', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await board([
      { type: 'remove', about: ['cooked'] },
      { type: 'name', words: 'Shop', about: ['kitchen', 'ordering'] },
    ]);
    const refused = await suggest(db, 'suggest-remove cooked');
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ error: 'declined_before' });
    expect((await suggest(db, 'suggest-name "shop" ordering kitchen')).status).toBe(422);

    const text = (await (await stormView(db, 'view=storm')).text()).split('\n');
    expect(text.slice(text.indexOf('declined'))).toEqual([
      'declined',
      '  remove cooked',
      '  name "Shop" kitchen,ordering',
    ]);
    const body: { declined: unknown[] } = await (await stormView(db, 'view=storm&json=1')).json();
    expect(body.declined).toHaveLength(2);
  });

  it('lets an agent take its suggestions back, the note staying', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await board();
    await suggest(db, 'suggest-remove cooked\nsuggest-name "Prep" kitchen');
    const cleared = await suggest(db, 'rm cooked suggested\nrm kitchen suggested');
    expect(cleared.status).toBe(200);
    const text = await (await stormView(db, 'view=storm')).text();
    expect(text).toContain('0 suggestions');
    expect(text).toContain('"Meal Cooked"');
    expect((await suggest(db, 'rm cooked suggested')).status).toBe(422);
  });
});

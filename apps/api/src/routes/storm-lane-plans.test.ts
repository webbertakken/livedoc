import { afterEach, describe, expect, it, vi } from 'vitest';
import { sentJson } from '@livedoc/vitest-config/sent-request';
import { ES_LANES, laneCentre, type Element } from '@livedoc/document';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import type { Env } from '../types';
import { makeTestRouteContext } from './test-route-context';
import { handleDocuments } from './documents';

// Lane plans and arranging end to end through the api (docs/specs/021-event-storming/lane-plans.md "How an agent
// suggests one", docs/specs/021-event-storming/arrange.md "How an agent arranges"): an agent's changeset makes one
// plan of its `suggest-lane` lines, the storm view lists it, a plan that changes the reading is refused, and
// `arrange` moves the notes. A kitchen's order flow, a lane per kind; invented.

const OWNER = 'user_owner';
const STEP = 216;

const note = (id: string, esKind: string, column: number, lane: number): Element =>
  ({
    id,
    type: 'sticky',
    x: column * STEP,
    y: laneCentre(lane, ES_LANES) - 100,
    width: 200,
    height: 200,
    label: id,
    esKind,
  }) as Element;

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

async function kitchen() {
  const db = sqliteD1({ DOCUMENT_ROOM: room } as unknown as Partial<Env>);
  const created = await call(db, 'person', 'POST', '/api/documents', {
    id: 'B',
    name: 'Kitchen',
    tabs: [
      {
        id: 'es',
        name: 'Board',
        kind: 'event-storming',
        elements: [
          note('cook', 'actor', 0, 0),
          note('waiter', 'actor', 2, 0),
          note('take-order', 'command', 0, 1),
          note('plate-dish', 'command', 2, 1),
          note('order-taken', 'domain-event', 0, 2),
          note('dish-plated', 'domain-event', 2, 2),
          note('fire-ticket', 'policy', 1, 3),
        ],
      },
    ],
  });
  expect(created.status).toBe(201);
  return db;
}

const edit = (db: SqliteD1, operations: string) =>
  call(db, 'agent', 'POST', '/api/documents/B/tabs/es/changesets', { operations });

const stormView = (db: SqliteD1, query: string) =>
  call(db, 'person', 'GET', `/api/documents/B/tabs/es?${query}`);

type Plan = { ref: string; lanes: { name: string; notes: number }[]; stale: boolean };

afterEach(() => vi.restoreAllMocks());

describe('lane plans through the api', () => {
  it('keeps the plan an agent suggests and lists it in the storm view', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await kitchen();
    const res = await edit(
      db,
      [
        'suggest-lane "Orders" cook take-order order-taken reason="Two parts of the business"',
        'suggest-lane "Kitchen" lanes=1,2,3,4',
      ].join('\n'),
    );
    expect(res.status).toBe(200);

    const text = (await (await stormView(db, 'view=storm')).text()).split('\n');
    expect(text[0]).toContain('1 suggestion');
    const at = text.indexOf('lane plan');
    expect(text[at + 1]).toMatch(
      /^ {2}\S+ 2 lanes: "Orders" 3 notes, "Kitchen" 4 notes · by Someone: Two parts of the business$/,
    );

    const body = (await (await stormView(db, 'view=storm&json=1')).json()) as {
      plan: Plan | null;
      reading: Record<string, unknown>;
    };
    expect(body.plan).toMatchObject({
      lanes: [
        { name: 'Orders', notes: 3 },
        { name: 'Kitchen', notes: 4 },
      ],
      stale: false,
    });
    // A plan is no part of what the board says.
    expect(body.reading).not.toHaveProperty('plan');
    const viewed = info.mock.calls.findLast(([fingerprint]) => fingerprint === '[storm] view');
    expect(viewed?.[1]).toMatchObject({ plan: 1 });

    // The agent takes its plan back by ref.
    expect((await edit(db, `rm ${body.plan!.ref}`)).status).toBe(200);
    const after = (await (await stormView(db, 'view=storm&json=1')).json()) as {
      plan: Plan | null;
    };
    expect(after.plan).toBeNull();
  });

  it('refuses a plan that would change what the board says', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await kitchen();
    const res = await edit(
      db,
      [
        'suggest-lane "Events" kind=domain-event',
        'suggest-lane "People" kind=actor',
        'suggest-lane "Rules" kind=policy',
        'suggest-lane "Commands" kind=command',
      ].join('\n'),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'reading_changes' });
  });

  it('arranges a board as one changeset, and says an arranged one is', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = await kitchen();
    const res = await edit(db, 'arrange');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string };
    expect(body.text).toContain('arranged');
    const again = await edit(db, 'arrange');
    expect(again.status).toBe(422);
    expect(await again.json()).toMatchObject({ error: 'nothing_to_arrange' });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Element } from '@livedoc/document';
import { DOMAIN_EXPORT_MAX_NOTES, ZIP_BUNDLE_FOLDER } from '@livedoc/storm-reading';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import type { Env } from '../types';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

// The zip export's route (docs/specs/021-event-storming/domain-export.md "The zip"), on real SQLite: the read gate,
// the refusals, the bundle without a model, and the model's answer read safely.

const OWNER = 'user_owner';
const note = (id: string, esKind: string, x: number, label: string) =>
  ({ id, type: 'sticky', x, y: 0, width: 200, height: 200, label, esKind }) as Element;
const BOARD = [
  note('cmd', 'command', 0, 'Place Order'),
  note('evt', 'domain-event', 216, 'Order Placed'),
];

const pending: Promise<unknown>[] = [];
function call(db: SqliteD1, method: string, path: string, body?: unknown, owner = OWNER) {
  return handleDocuments(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner,
      sessionAccountId: owner,
      verifiedAccountId: owner,
      body,
      waitUntil: (p) => void pending.push(p),
    }),
  );
}

async function setUp(env: Partial<Env> = {}, elements: Element[] = BOARD) {
  const db = sqliteD1(env);
  const created = await call(db, 'POST', '/api/documents', {
    id: 'B',
    name: 'Storm',
    tabs: [
      { id: 'es', name: 'Orders', kind: 'event-storming', elements },
      { id: 'plain', name: 'Plain', elements: [] },
    ],
  });
  expect(created.status).toBe(201);
  return db;
}

const exportOf = (db: SqliteD1, body: unknown, tab = 'es', owner = OWNER) =>
  call(db, 'POST', `/api/documents/B/tabs/${tab}/storm-export`, body, owner);

const originalFetch = globalThis.fetch;
function modelSays(content: string, status = 200) {
  const event = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
  globalThis.fetch = vi.fn(async () =>
    status === 200 ? new Response(event, { status }) : new Response('nope', { status }),
  );
}

let infos: unknown[][] = [];
const quiet = () => {
  infos = [];
  vi.spyOn(console, 'info').mockImplementation((...args) => void infos.push(args));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
};
const logged = (tag: string) => infos.findLast((args) => args[0] === tag)?.[1];

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('POST …/storm-export', () => {
  it('answers the bundle alone, with its README, when the deployment has no model', async () => {
    quiet();
    const db = await setUp();
    const res = await exportOf(db, { language: 'typescript' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: Record<string, string>; written: boolean };
    expect(body.written).toBe(false);
    expect(Object.keys(body.files)).toEqual([
      'README.md',
      `${ZIP_BUNDLE_FOLDER}/storm.json`,
      `${ZIP_BUNDLE_FOLDER}/storm.md`,
      `${ZIP_BUNDLE_FOLDER}/CONVERT.md`,
      `${ZIP_BUNDLE_FOLDER}/export.json`,
    ]);
    expect(body.files['README.md']).toContain('Hand `livedoc/CONVERT.md` to a coding agent');
    expect(logged('[storm] export')).toMatchObject({
      doc: 'B',
      tab: 'es',
      notes: 2,
      written: false,
    });
  });

  it('has the deployment’s model write the spec and types, keeping what it left out', async () => {
    quiet();
    // An earlier zip of the same board: the bundle alone, from a deployment without a model.
    const first = (await (await exportOf(await setUp(), { language: 'typescript' })).json()) as {
      files: Record<string, string>;
    };
    const db = await setUp({ OPENAI_API_KEY: 'test-key' });
    modelSays(
      JSON.stringify({
        files: [
          { path: 'docs/specs/README.md', content: '# Orders\n' },
          { path: '../escape.ts', content: 'no' },
        ],
      }),
    );
    const res = await exportOf(db, {
      language: 'typescript',
      previous: { ...first.files, 'src/orders/order.ts': 'export type Order = {};\n' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: Record<string, string>; written: boolean };
    expect(body.written).toBe(true);
    expect(body.files['docs/specs/README.md']).toBe('# Orders\n');
    expect(body.files['src/orders/order.ts']).toBe('export type Order = {};\n');
    expect(body.files['../escape.ts']).toBeUndefined();
    expect(body.files[`${ZIP_BUNDLE_FOLDER}/CHANGES.md`]).toBeDefined();
    expect(logged('[storm] export')).toMatchObject({ written: true, dropped: 1 });
  });

  it('answers ai_failed when the model errors, cannot be reached, or answers no such JSON', async () => {
    quiet();
    const db = await setUp({ OPENAI_API_KEY: 'test-key' });
    modelSays('', 500);
    expect((await exportOf(db, { language: 'go' })).status).toBe(502);
    modelSays('I could not');
    const unreadable = await exportOf(db, { language: 'go' });
    expect(unreadable.status).toBe(502);
    expect(await unreadable.json()).toMatchObject({ error: 'ai_failed' });
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('network down');
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const unreachable = exportOf(db, { language: 'go' });
    await vi.advanceTimersByTimeAsync(5000);
    expect((await unreachable).status).toBe(502);
    vi.useRealTimers();
  });

  it('answers the bundle alone when asked, without asking the model', async () => {
    quiet();
    const db = await setUp({ OPENAI_API_KEY: 'test-key' });
    globalThis.fetch = vi.fn();
    const res = await exportOf(db, { language: 'go', bundleOnly: true });
    expect(await res.json()).toMatchObject({ written: false });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps the model behind the AI gates', async () => {
    quiet();
    const db = await setUp({
      OPENAI_API_KEY: 'test-key',
      AI_ALLOWED_ORIGINS: 'https://docs.nu',
    });
    globalThis.fetch = vi.fn();
    const res = await exportOf(db, { language: 'typescript' });
    expect(res.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refuses what is not an export', async () => {
    quiet();
    const db = await setUp();
    expect(await (await exportOf(db, { language: 'typescript' }, 'plain')).json()).toMatchObject({
      error: 'not_event_storming',
    });
    expect((await exportOf(db, { language: 'cobol' })).status).toBe(400);
    expect((await exportOf(db, null)).status).toBe(400);
    expect(await (await exportOf(db, { language: 'go', previous: 'zip' })).json()).toMatchObject({
      error: 'previous_invalid',
    });
    expect(
      await (await exportOf(db, { language: 'go', previous: { 'src/a.ts': 'x' } })).json(),
    ).toMatchObject({ error: 'previous_invalid' });
    const big = await exportOf(db, {
      language: 'go',
      previous: { 'src/a.ts': 'x'.repeat(3 * 1024 * 1024) },
    });
    expect(big.status).toBe(413);
    expect(logged('[storm] export refused')).toEqual({ error: 'previous_too_large' });
    expect((await call(db, 'GET', '/api/documents/B/tabs/es/storm-export')).status).toBe(405);
    expect((await exportOf(db, { language: 'go' }, 'missing')).status).toBe(404);
  });

  it('refuses a board past the note cap', async () => {
    quiet();
    const many = Array.from({ length: DOMAIN_EXPORT_MAX_NOTES + 1 }, (_, i) =>
      note(`n${i}`, 'domain-event', i * 216, `Thing ${i} happened`),
    );
    const db = await setUp({}, many);
    expect(await (await exportOf(db, { language: 'go' })).json()).toMatchObject({
      error: 'board_too_large',
    });
  });

  it('is read only by those who may read the board', async () => {
    quiet();
    const db = await setUp();
    expect(
      (await exportOf(db, { language: 'go' }, 'es', 'user_stranger')).status,
    ).toBeGreaterThanOrEqual(403);
    expect((await call(db, 'POST', '/api/documents/NOPE/tabs/es/storm-export', {})).status).toBe(
      404,
    );
  });
});

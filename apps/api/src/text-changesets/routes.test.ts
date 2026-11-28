import { beforeEach, describe, expect, it } from 'vitest';
import {
  LiveSuggestions,
  LiveThreads,
  TextDocumentState,
  bytesOfBase64,
} from '@livedoc/text-documents';
import { adderKeyFor } from '../adder-key';
import { createShareLink } from '../db/share';
import { appendLiveTabUpdate, storedUpdates } from '../live-tabs/live-tab-store';
import { RoomLiveTabs } from '../live-tabs/room-live-tabs';
import { handleDocuments } from '../routes/documents';
import { makeTestRouteContext } from '../routes/test-route-context';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { parseStoredLevel } from '@livedoc/api-schema';
import { countsOf } from './routes';

// docs/specs/024-agents/agent-changesets.md "A text document's changesets": submitted on the tab, applied to the state as
// it stands, stored and relayed by the room, recorded, listed with the document's changesets, and reverted exactly.

let db: SqliteD1;
let relayed: unknown[];

// A room whose internal door runs the real room side over the test's database, its Participant judge included.
function withRoom() {
  relayed = [];
  const room = new RoomLiveTabs(TEXT_DOCUMENT_LIVE_TAB, {
    env: db.env,
    enqueue: (step) => step(),
    sequence: (_from, op) => relayed.push(op),
    sendTo: () => {},
    position: () => ({ epoch: 'e' }),
  });
  (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        if (url.pathname !== '/live-tab-update') return new Response(null, { status: 404 });
        const outcome = await room.acceptPosted(
          url.searchParams.get('document')!,
          url.searchParams.get('tab')!,
          new Uint8Array(init!.body as ArrayBuffer),
          {
            level: parseStoredLevel(url.searchParams.get('level')),
            adderKey: url.searchParams.get('adder'),
          },
        );
        if (outcome === 'characters' || outcome === 'state')
          return Response.json({ limit: outcome }, { status: 413 });
        if (outcome === 'not-yours')
          return Response.json({ name: 'not_your_mark' }, { status: 403 });
        return new Response(null, { status: outcome === 'stored' ? 204 : 404 });
      },
    }),
  };
}

function call(
  method: 'GET' | 'POST',
  path: string,
  opts: { body?: unknown; code?: string; token?: boolean } = {},
) {
  return handleDocuments(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner: opts.code ? 'visitor' : 'owner',
      ...(opts.body !== undefined ? { body: opts.body as Record<string, unknown> } : {}),
      ...(opts.code ? { headers: { 'X-Share-Code': opts.code } } : {}),
      ...(opts.token ? { token: { id: 'tok-1' } } : {}),
    }),
  );
}

const submit = (body: unknown, opts: { code?: string; tab?: string; query?: string } = {}) =>
  call('POST', `/api/documents/D/tabs/${opts.tab ?? 't1'}/changesets${opts.query ?? ''}`, {
    body,
    token: true,
    ...(opts.code ? { code: opts.code } : {}),
  });

const stateDoc = async () =>
  TextDocumentState.load(await storedUpdates(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1'));
const texts = async () => TextDocumentState.paragraphs(await stateDoc()).map((p) => p.text);

beforeEach(async () => {
  db = sqliteD1();
  const res = await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'owner',
      body: {
        id: 'D',
        name: 'Report',
        tabs: [
          { id: 't1', kind: 'text-document', name: 'T', format: 'odf', elements: [] },
          { id: 't2', kind: 'diagram', name: 'C', elements: [] },
        ],
      },
    }),
  );
  expect(res.status).toBe(201);
  await appendLiveTabUpdate(
    db.env,
    TEXT_DOCUMENT_LIVE_TAB,
    't1',
    TextDocumentState.fromBody([{ text: 'Hello world' }, { text: 'Second line' }]),
  );
  await createShareLink(db.env, 'D', 'VIEWCODE', 'view');
  await createShareLink(db.env, 'D', 'PARTCODE', 'participate');
  withRoom();
});

describe('a text document changeset', () => {
  it('applies, stores, relays and records the operations', async () => {
    const res = await submit({ ops: 'edit "Hello" "Hi"\nappend "Third."', summary: 'tidy' });
    expect(res.status).toBe(200);
    const body = await res.json<{
      changeset: { id: string; counts: unknown };
      results: string[];
      text: string;
    }>();
    expect(body).toMatchObject({
      dryRun: false,
      results: ['edited ¶1', 'appended ¶3'],
      text: 'edited ¶1\nappended ¶3',
      changeset: { tabId: 't1', documentTab: 't.0', counts: { added: 1, changed: 1, removed: 0 } },
    });
    expect(body.changeset.id).toMatch(/^tc_/);
    expect(await texts()).toEqual(['Hi world', 'Second line', 'Third.']);
    expect(relayed).toHaveLength(1);

    const list = await (
      await call('GET', '/api/documents/D/changesets')
    ).json<{
      changesets: { id: string; summary: string; agent: boolean; tokenId?: string }[];
    }>();
    expect(list.changesets[0]).toMatchObject({
      id: body.changeset.id,
      summary: 'tidy',
      agent: true,
      tokenId: 'tok-1',
    });
    const one = await call('GET', `/api/documents/D/changesets/${body.changeset.id}`);
    expect(await one.json()).toMatchObject({ results: ['edited ¶1', 'appended ¶3'] });
  });

  it('answers a dry run’s results and writes nothing', async () => {
    const res = await submit({ ops: 'append "x"' }, { query: '?dryRun=1' });
    expect(await res.json()).toMatchObject({
      dryRun: true,
      changeset: null,
      results: ['appended ¶3'],
    });
    expect(await texts()).toEqual(['Hello world', 'Second line']);
    expect(relayed).toHaveLength(0);
  });

  it('records nothing for operations that change nothing', async () => {
    const res = await submit({ ops: 'format "Hello" -bold' });
    expect(await res.json()).toMatchObject({ changeset: null, results: ['formatted ¶1 -bold'] });
    expect(relayed).toHaveLength(0);
  });

  it.each([
    [{ ops: 'edit "nowhere" "x"' }, 422, 'text_not_found'],
    [{ ops: 'edit "l" "x"' }, 422, 'text_ambiguous'],
    [{ ops: 'insert after ¶9 "x"' }, 422, 'ref_not_found'],
    [{ ops: 'frobnicate' }, 400, 'invalid_operation'],
    [{ ops: 'replace "x"' }, 412, 'stale_tab'],
    [{ ops: 'append "x"', documentTab: 'Nope' }, 422, 'ref_not_found'],
    [{ operations: 'add box "A"' }, 400, 'not_a_text_document'],
    [{ ops: 42 }, 400, 'invalid_body'],
    [{ ops: 'append "x"', documentTab: '' }, 400, 'invalid_body'],
    [{ ops: 'append "x"', summary: 'x'.repeat(81) }, 400, 'invalid_value'],
    [{ ops: 'append "x"', summary: 4 }, 400, 'invalid_body'],
    [{ ops: 'append "x"', base: 'not base64!' }, 400, 'invalid_base'],
    [{ ops: Array.from({ length: 201 }, () => 'append "x"').join('\n') }, 413, 'invalid_operation'],
  ])('refuses %j as %i %s, writing nothing', async (body, status, error) => {
    const res = await submit(body);
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error });
    expect(relayed).toHaveLength(0);
  });

  it('refuses a body that is not an object', async () => {
    const res = await handleDocuments(
      makeTestRouteContext('POST', '/api/documents/D/tabs/t1/changesets', {
        env: db.env,
        owner: 'owner',
        rawBody: '[1]',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await res.json()).toMatchObject({ error: 'invalid_body' });
  });

  it('replaces the tab from the base a view answered', async () => {
    const view = await call('GET', '/api/documents/D/tabs/t1?view=text');
    const base = view.headers.get('X-State-Vector')!;
    expect(TextDocumentState.isStateVector(bytesOfBase64(base)!)).toBe(true);
    const res = await submit({ ops: 'replace "# New"', base });
    expect(await res.json()).toMatchObject({ results: ['replaced ¶1'] });
    expect(await texts()).toEqual(['New']);
  });

  it('refuses text operations on a canvas tab', async () => {
    const res = await submit({ ops: 'append "x"' }, { tab: 't2' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'not_a_text_document' });
  });

  it('lets a Participant comment and suggest as themselves, and nothing else', async () => {
    const refused = await submit({ ops: 'comment "Hello" "Hm"\nappend "x"' }, { code: 'PARTCODE' });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({
      error: 'forbidden_operation',
      line: 2,
      operation: 2,
    });
    const res = await submit(
      { ops: 'comment "Hello" "Hm"\nsuggest edit "world" "all"' },
      { code: 'PARTCODE' },
    );
    expect(res.status).toBe(200);
    const doc = await stateDoc();
    const key = await adderKeyFor('D', 'visitor');
    expect(LiveThreads.read(doc)[0]!.comments[0]!.author.key).toBe(key);
    expect(LiveSuggestions.read(doc).map((s) => s.author.key)).toEqual([key]);
  });

  it('refuses a Viewer', async () => {
    expect((await submit({ ops: 'comment "Hello" "Hm"' }, { code: 'VIEWCODE' })).status).toBe(403);
  });

  it('answers the room’s size refusal', async () => {
    (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => Response.json({ limit: 'characters' }, { status: 413 }) }),
    };
    const res = await submit({ ops: 'append "x"' });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'document_too_large' });
  });

  it('answers 503 when the room is out of reach', async () => {
    (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => new Response(null, { status: 500 }) }),
    };
    expect((await submit({ ops: 'append "x"' })).status).toBe(503);
  });
});

describe('reverting a text document changeset', () => {
  it('undoes exactly that changeset, once, and keeps what was written since', async () => {
    const first = await (
      await submit({ ops: 'edit "Hello" "Hi"\ncomment "Second" "Why?"' })
    ).json<{ changeset: { id: string } }>();
    await submit({ ops: 'append "Later."' });
    const revert = await call('POST', `/api/documents/D/changesets/${first.changeset.id}/revert`, {
      token: true,
    });
    expect(revert.status).toBe(200);
    const body = await revert.json<{ changeset: { id: string } }>();
    expect(body.changeset.id).toMatch(/^tc_/);
    expect(await texts()).toEqual(['Hello world', 'Second line', 'Later.']);
    expect(LiveThreads.read(await stateDoc())[0]!.resolved).toBe(true);
    const again = await call('POST', `/api/documents/D/changesets/${first.changeset.id}/revert`);
    expect(await again.json()).toEqual({ changeset: null });
    const list = await (
      await call('GET', '/api/documents/D/changesets')
    ).json<{
      changesets: { id: string; revertOf: string | null }[];
    }>();
    expect(list.changesets.find((c) => c.id === body.changeset.id)?.revertOf).toBe(
      first.changeset.id,
    );
    const revertOfRevert = await call(
      'POST',
      `/api/documents/D/changesets/${body.changeset.id}/revert`,
    );
    expect(revertOfRevert.status).toBe(200);
    expect(await texts()).toEqual(['Hi world', 'Second line', 'Later.']);
  });

  it('refuses a Participant’s revert, and answers an unknown changeset 404', async () => {
    const first = await (await submit({ ops: 'append "x"' })).json<{ changeset: { id: string } }>();
    const res = await call('POST', `/api/documents/D/changesets/${first.changeset.id}/revert`, {
      code: 'PARTCODE',
    });
    expect(res.status).toBe(403);
    expect((await call('GET', '/api/documents/D/changesets/tc_0000000000')).status).toBe(404);
  });
});

describe('countsOf', () => {
  it('counts the paragraphs added and the other operations', () => {
    expect(
      countsOf(['inserted ¶3..¶5', 'appended ¶9', 'edited ¶1', 'reverted tc_0000000000']),
    ).toEqual({
      added: 4,
      changed: 2,
      removed: 0,
    });
  });
});

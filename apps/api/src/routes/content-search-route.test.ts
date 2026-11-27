import { describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import { contentSearchStatements } from '../db/content-search';
import { handleContentSearch } from './content-search-route';
import { makeTestRouteContext } from './test-route-context';
import type { Env } from '../types';
import { Body, LiveThreads, TextDocumentState } from '@livedoc/text-documents';
import { appendLiveTabUpdate } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { handleDocuments } from './documents';
import { createShareLink } from '../db/share';

function setup(extra: Partial<Env> = {}) {
  const { env, sql } = sqliteD1(extra);
  sql.exec(
    "INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES ('d1', 'me', 'D', 1, 1)",
  );
  return { env, sql };
}

const ctx = (env: Env, path: string, owner: string | null = 'me') =>
  makeTestRouteContext('GET', path, { owner, env });

describe('GET /api/search/content', () => {
  it('answers the matches as ContentSearchDTO', async () => {
    const { env } = setup();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const s of contentSearchStatements(env, 'd1', 't1', 'Tab', 'flamingo notes'))
      await s.run();
    const res = await handleContentSearch(ctx(env, '/api/search/content?q=flamngo'));
    expect(res.status).toBe(200);
    const body = await res.json<{ matches: { documentId: string; tabName: string }[] }>();
    expect(body.matches).toMatchObject([{ documentId: 'd1', tabId: 't1', tabName: 'Tab' }]);
  });

  it('needs a caller and a query', async () => {
    const { env } = setup();
    expect((await handleContentSearch(ctx(env, '/api/search/content?q=x', null))).status).toBe(400);
    expect((await handleContentSearch(ctx(env, '/api/search/content'))).status).toBe(400);
  });

  it('answers 429 past the limit', async () => {
    const { env } = setup({ SEARCH_RATE_LIMITER: { limit: async () => ({ success: false }) } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await handleContentSearch(ctx(env, '/api/search/content?q=abc'))).status).toBe(429);
  });

  it('answers 503 when the read fails', async () => {
    const { env, sql } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sql.exec('DROP TABLE content_search_fts');
    const res = await handleContentSearch(ctx(env, '/api/search/content?q=abc'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'search_unavailable' });
  });

  it('answers other paths and methods 404', async () => {
    const { env } = setup();
    expect((await handleContentSearch(ctx(env, '/api/search/other?q=a'))).status).toBe(404);
    expect(
      (
        await handleContentSearch(
          makeTestRouteContext('POST', '/api/search/content?q=a', { owner: 'me', env }),
        )
      ).status,
    ).toBe(404);
  });
});

// review.md "What a Viewer receives"; content-search.md "What is searched": a text document is found by its writing,
// never by a comment's words, for a Viewer or an Editor.
describe('GET /api/search/content, a text document with a comment', () => {
  it('finds nothing by a comment’s unique word, for the owner or a Viewer, and the writing for both', async () => {
    const { env, sql } = sqliteD1();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await handleDocuments(
      makeTestRouteContext('POST', '/api/documents', {
        env,
        owner: 'me',
        body: {
          id: 'D',
          name: 'Report',
          tabs: [{ id: 't1', name: 'T', kind: 'text-document', elements: [] }],
        },
      }),
    );
    const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('Quarterly results'))]);
    LiveThreads.begin(
      doc,
      {
        id: 'thread-1',
        tab: 't.0',
        ...LiveThreads.anchorFor(TextDocumentState.body(doc), 0, 1),
        quote: 'Quarterly',
        comment: {
          id: 'c1',
          text: 'Zanzibarquokka',
          at: 1,
          author: { key: 'k-me', name: 'Me', colour: '#123456' },
        },
      },
      'test',
    );
    await appendLiveTabUpdate(env, TEXT_DOCUMENT_LIVE_TAB, 't1', TextDocumentState.encode(doc));
    // A Viewer who visited through a live view link.
    await createShareLink(env, 'D', 'VIEWCODE', 'view');
    sql.exec("UPDATE documents SET shareable = 1 WHERE id = 'D'");
    sql.exec(
      "INSERT INTO shared_with (owner_id, document_id, role, level, last_seen) VALUES ('viewer', 'D', 'view', 'view', 1)",
    );
    const found = async (q: string, owner: string) =>
      (
        await (
          await handleContentSearch(ctx(env, `/api/search/content?q=${q}`, owner))
        ).json<{ matches: { documentId: string }[] }>()
      ).matches.map((m) => m.documentId);
    for (const reader of ['me', 'viewer']) {
      expect(await found('Zanzibarquokka', reader)).toEqual([]);
      expect(await found('Quarterly', reader), reader).toEqual(['D']);
    }
  });
});

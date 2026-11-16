import { describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import { contentSearchStatements } from '../db/content-search';
import { handleContentSearch } from './content-search-route';
import { makeTestRouteContext } from './test-route-context';
import type { Env } from '../types';

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

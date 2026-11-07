// GET /api/search/content?q= (docs/specs/013-workspace/content-search.md,
// docs/specs/013-workspace/content-search.md): the documents the caller may open whose content
// matches the query, best first. Read-only; hybrid identity like the lists.

import type { ContentSearchDTO } from '@livedoc/api-schema';
import { searchContent } from '../db/content-search';
import { badRequest, json, missingAuth, notFound, rateLimited } from '../responses';
import type { RouteContext } from './context';

export async function handleContentSearch(ctx: RouteContext): Promise<Response> {
  const { request, env, url, segments, resolveOwner } = ctx;
  if (segments[1] !== 'search' || segments[2] !== 'content' || segments.length !== 3)
    return notFound();
  if (request.method !== 'GET') return notFound();
  const owner = resolveOwner();
  if (!owner) return missingAuth();
  const q = url.searchParams.get('q');
  if (q === null) return badRequest('q is required');
  if (env.SEARCH_RATE_LIMITER && !(await env.SEARCH_RATE_LIMITER.limit({ key: owner })).success) {
    console.warn('[content-search] rate-limited');
    return rateLimited();
  }
  try {
    const body: ContentSearchDTO = { matches: await searchContent(env, owner, q, Date.now()) };
    return json(body);
  } catch (err) {
    console.error(
      `[content-search] failed error=${err instanceof Error ? err.message : String(err)}`,
    );
    return json({ error: 'search_unavailable' }, { status: 503 });
  }
}

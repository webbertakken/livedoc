// /api/preferences — per-user editor preference flags (docs/specs/007-editor/user-preferences.md).

import { PREFERENCES_BODY_MAX } from '@livedoc/api-schema';
import { badRequest, json, missingAuth, noContent, notFound } from '../responses';
import type { RouteContext } from './context';

// Per-user editor preference flags (docs/specs/007-editor/user-preferences.md). Stored as a single
// JSON blob per owner so adding a flag never needs a migration.
// Hybrid identity: account id when signed in, X-Owner-Id
// otherwise, matching the rest of the api. The blob is opaque
// to the worker beyond a small size cap, so a malformed client
// reflects malformed prefs back to itself; no per-field
// validation here.
export async function handlePreferences(ctx: RouteContext): Promise<Response> {
  const { request, env, segments, resolveOwner } = ctx;
  if (!(segments[1] === 'preferences' && segments.length === 2)) return notFound();
  const ownerId = resolveOwner();
  if (!ownerId) return missingAuth();
  if (request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT prefs FROM user_preferences WHERE owner_id = ?1 LIMIT 1',
    )
      .bind(ownerId)
      .first<{ prefs: string }>();
    let prefs: Record<string, unknown> = {};
    if (row?.prefs) {
      try {
        const parsed: unknown = JSON.parse(row.prefs);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          prefs = parsed as Record<string, unknown>;
        }
      } catch {
        // Corrupt row: treat as empty, the client will overwrite
        // on its next toggle.
      }
    }
    return json({ prefs });
  }
  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > PREFERENCES_BODY_MAX) {
      return badRequest(`preferences payload too large (${PREFERENCES_BODY_MAX} characters max)`);
    }
    // No initialiser: the catch returns, so control only reaches past the block
    // when the assignment succeeded. The `| null` stays because JSON.parse
    // legitimately yields null for the body "null", which the check below
    // rejects.
    let body: { prefs?: unknown } | null;
    try {
      body = JSON.parse(text) as { prefs?: unknown } | null;
    } catch {
      return badRequest('invalid JSON');
    }
    if (!body || typeof body.prefs !== 'object' || body.prefs === null) {
      return badRequest('prefs must be an object');
    }
    const serialised = JSON.stringify(body.prefs);
    const now = Date.now();
    // Written only for a guest or an account that still exists: a session token outlives a closed account by up to
    // 15 minutes, and a write in that window would bring back preferences for an account nothing sweeps.
    const isAccount = ctx.verifiedAccountId !== null && ctx.verifiedAccountId === ownerId;
    const res = await env.DB.prepare(
      `INSERT INTO user_preferences (owner_id, prefs, updated_at)
       SELECT ?1, ?2, ?3 WHERE ?4 = 0 OR EXISTS (SELECT 1 FROM identity_users WHERE id = ?1)
       ON CONFLICT (owner_id) DO UPDATE SET prefs = excluded.prefs, updated_at = excluded.updated_at`,
    )
      .bind(ownerId, serialised, now, isAccount ? 1 : 0)
      .run();
    if ((res.meta?.changes ?? 0) === 0) {
      console.warn('[preferences] write_refused reason=unknown_owner');
      return json({ error: 'unknown_owner' }, { status: 404 });
    }
    return noContent();
  }
  return notFound();
}

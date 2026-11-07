// POST /api/migrate: a guest's data moves into the account it signed in to (docs/specs/014-identity/
// auth-and-guest-access.md "Guest → account upgrade").

import { isAccountIdShape } from '@livedoc/api-schema';
import { verifyOwnerId } from '../auth/owner-signature';
import { migrateOwnerId } from '../db';
import { badRequest, forbidden, json, missingAuth, notFound } from '../responses';
import { readOptionalBody, type RouteContext } from './context';

const ZERO = { documents: 0, folders: 0, shared: 0, images: 0 };

// Moves every guest-holdable row (docs/specs/015-api/api.md "Owner-keyed data") from a guest id to the account a
// session token proves. The live app calls this once a session settles while a guest id is still in the browser.
//
// - Session only: no guest-header fallback, no API token, no workbench session.
// - The SOURCE guest id must prove possession with its HMAC signature (`guestSignature`, minted with it at
//   POST /api/guest-id); otherwise anyone who merely observed a guest's id (it leaks via DTOs and presence) could
//   claim that guest's entire data set. See auth/owner-signature.ts. An unsigned guest id never moves.
// - The source is never an account id: account ids are harvestable (team member lists).
//
// Idempotent: a retry with the same guest id moves zero rows.
export async function handleMigrate(ctx: RouteContext): Promise<Response> {
  const { request, env, segments, sessionAccountId } = ctx;
  if (!(segments[1] === 'migrate' && segments.length === 2)) return notFound();
  if (request.method !== 'POST') return notFound();
  if (!sessionAccountId) return refused('no_session', missingAuth());

  const read = await readOptionalBody(request);
  if (read instanceof Response) return refused('unreadable_body', read);
  const body = read as { guestOwnerId?: unknown; guestSignature?: unknown };
  const fromOwnerId = typeof body.guestOwnerId === 'string' ? body.guestOwnerId.trim() : '';
  if (!fromOwnerId) return refused('no_guest_id', badRequest('guestOwnerId is required'));
  if (fromOwnerId === sessionAccountId) return moved(ZERO);
  if (isAccountIdShape(fromOwnerId)) return refused('account_id', forbidden());
  if (!(await verifyOwnerId(env, fromOwnerId, stringOrNull(body.guestSignature)))) {
    return refused('signature', forbidden());
  }
  return moved(await migrateOwnerId(env, fromOwnerId, sessionAccountId));
}

function moved(migrated: typeof ZERO): Response {
  const rows = Object.values(migrated).reduce((sum, n) => sum + n, 0);
  console.info(`[migrate] moved rows=${rows}`);
  return json({ migrated });
}

function refused(reason: string, response: Response): Response {
  console.warn(`[migrate] refused reason=${reason}`);
  return response;
}

// A signature as sent: anything but a string is no signature at all.
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

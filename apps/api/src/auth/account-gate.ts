// Administration needs a live account (docs/specs/014-identity/auth-and-guest-access.md "Errors and edge
// cases", "Deleted account's token still within 15 minutes"). A session token verifies on its own for up to
// 15 minutes, so it outlives an account deleted in that window; administration must not act for one. Content routes
// keep the hot path free of a D1 read: the deleted account's rows are already gone.
import { accountExists } from '../db/identity';
import { json } from '../responses';
import type { Env } from '../types';

// The resource segments a session administers through (spec "How the api knows who is calling", "Only a session
// administers"): the account, teams, tokens, approving an MCP client (OAuth) or a CLI (workbench pairing), and the
// guest migration.
export const ADMINISTRATION_SEGMENTS: ReadonlySet<string> = new Set([
  'account',
  'teams',
  'tokens',
  'oauth',
  'workbench',
  'migrate',
]);

// Null when the request may go on: not administration, or the session's account still exists. Otherwise the 401.
export async function requireAccount(
  env: Env,
  sessionAccountId: string,
  segment: string,
): Promise<Response | null> {
  if (!ADMINISTRATION_SEGMENTS.has(segment)) return null;
  if (await accountExists(env, sessionAccountId)) return null;
  console.warn(`[auth] account_not_found route=${segment}`);
  return json({ error: 'account_not_found' }, { status: 401 });
}

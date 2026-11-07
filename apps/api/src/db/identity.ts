// The identity tables better-auth writes (docs/specs/014-identity/auth-and-guest-access.md "Data and
// persistence"): what LiveDoc itself does to them. Dates are ISO strings there, so an ISO cutoff compares in order.
import type { Env } from '../types';

// Expired sessions and sign-in codes: nothing reads them again. Daily cron.
export async function deleteExpiredIdentityRows(env: Env, now: number): Promise<number> {
  const cutoff = new Date(now).toISOString();
  const [sessions, codes] = await env.DB.batch([
    env.DB.prepare('DELETE FROM identity_sessions WHERE expiresAt < ?').bind(cutoff),
    env.DB.prepare('DELETE FROM identity_verifications WHERE expiresAt < ?').bind(cutoff),
  ]);
  return (sessions?.meta.changes ?? 0) + (codes?.meta.changes ?? 0);
}

// The outbox keeps a day of mail (previews and the e2e stack only). Daily cron.
export async function deleteOldOutboxMail(env: Env, cutoff: number): Promise<number> {
  const res = await env.DB.prepare('DELETE FROM email_outbox WHERE created_at < ?')
    .bind(cutoff)
    .run();
  return res.meta.changes ?? 0;
}

// The account itself: its row, and with it (ON DELETE CASCADE) every session and sign-in method, plus any code
// still pending for its address. Runs after the owner-keyed data is gone (spec "Deleting an account"). Answers the
// address the account had, read before the row goes (the goodbye email's recipient), or null when there was no account.
export async function deleteIdentity(env: Env, accountId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT email FROM identity_users WHERE id = ?')
    .bind(accountId)
    .first<{ email: string }>();
  if (!row) return null;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM identity_verifications WHERE identifier = ?').bind(
      `sign-in-otp-${row.email}`,
    ),
    env.DB.prepare('DELETE FROM identity_users WHERE id = ?').bind(accountId),
  ]);
  console.info('[auth] account_deleted');
  return row.email;
}

// Whether an account still exists: a session token outlives its account by up to 15 minutes, and an
// administration route must not act for a deleted one.
export async function accountExists(env: Env, accountId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS one FROM identity_users WHERE id = ?')
    .bind(accountId)
    .first<{ one: number }>();
  return row !== null;
}

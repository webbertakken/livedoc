'use client';

// What Settings > Account does to the account (docs/specs/014-identity/auth-and-guest-access.md
// "Presentation and UX"): its name, its sign-in methods and its sessions, through better-auth's client. The client
// is imported on first use, so it lands in its own chunk and never in the Settings dialog's.
import { describeUserAgent } from './user-agent';

const client = async () => (await import('./auth-client')).authClient;

// The longest name the account takes (the sign-up form's limit).
export const ACCOUNT_NAME_MAX = 100;

export type AccountSessionRow = {
  token: string;
  label: string;
  lastActive: Date;
  current: boolean;
};

export async function saveAccountName(name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > ACCOUNT_NAME_MAX) return false;
  const { error } = await (await client()).updateUser({ name: trimmed });
  if (error) console.warn('[account] name_save_failed', error.status);
  return !error;
}

// The linked Google sign-in method's id (what unlinking names), false when none is linked, null when the list could
// not be read.
export async function readGoogleAccount(): Promise<string | false | null> {
  const { data, error } = await (await client()).listAccounts();
  if (error || !data) return null;
  return data.find((account) => account.providerId === 'google')?.id ?? false;
}

// What linking or unlinking came to. Both need a fresh sign-in (routes/auth.ts on the api).
export type MethodOutcome = 'done' | 'not_fresh' | 'failed';

function methodOutcome(
  error: { status: number; code?: string } | null,
  what: string,
): MethodOutcome {
  if (!error) return 'done';
  if (error.status === 403 && error.code === 'SESSION_NOT_FRESH') return 'not_fresh';
  console.warn(`[account] ${what}_failed`, error.status);
  return 'failed';
}

// Starts Google's round trip; on success the browser leaves for Google and comes back to `returnTo`.
export async function connectGoogle(returnTo: string): Promise<MethodOutcome> {
  const { error } = await (
    await client()
  ).linkSocial({ provider: 'google', callbackURL: returnTo });
  return methodOutcome(error, 'google_link');
}

export async function removeGoogle(accountId: string): Promise<MethodOutcome> {
  const { error } = await (await client()).unlinkAccount({ accountId });
  return methodOutcome(error, 'google_unlink');
}

// Every session of the account, newest activity first, the current one marked; null when they could not be read.
export async function readAccountSessions(): Promise<AccountSessionRow[] | null> {
  const auth = await client();
  const [{ data: sessions, error }, { data: current }] = await Promise.all([
    auth.listSessions(),
    auth.getSession(),
  ]);
  if (error || !sessions) return null;
  return sessions
    .map((session) => ({
      token: session.token,
      label: describeUserAgent(session.userAgent),
      lastActive: new Date(session.updatedAt),
      current: session.token === current?.session.token,
    }))
    .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
}

export async function signOutSession(token: string): Promise<boolean> {
  const { error } = await (await client()).revokeSession({ token });
  return !error;
}

export async function signOutOtherSessions(): Promise<boolean> {
  const { error } = await (await client()).revokeOtherSessions();
  return !error;
}

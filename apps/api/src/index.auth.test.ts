import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import { resetSessionKeyCache } from './auth/session-token';
import { sqliteD1 } from './test-sqlite-d1';
import type { Env } from './types';

// The whole front door with sign-in on (docs/specs/014-identity/auth-and-guest-access.md "How the api knows who is
// calling"), over a real SQLite D1 with every migration: a code from the outbox, a session cookie, a session
// token, and the api treating that token as the account.
const ORIGIN = 'https://docs.test';
const SIGN_IN = { BETTER_AUTH_SECRET: 's'.repeat(40), APP_BASE_URL: ORIGIN, EMAIL_OUTBOX: '1' };

let env: Env;
// Background work (`waitUntil`) the worker scheduled, awaited by tests that read what it sent.
let background: Promise<unknown>[] = [];
const executionCtx = {
  waitUntil: (promise: Promise<unknown>) => void background.push(promise),
  passThroughOnException: () => {},
} as unknown as ExecutionContext;
let sql: ReturnType<typeof sqliteD1>['sql'];

function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  headers.set('Origin', ORIGIN);
  return worker.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), env, executionCtx);
}

async function signIn(email: string): Promise<{ cookie: string; token: string; id: string }> {
  await call('/api/auth/email-otp/send-verification-otp', {
    method: 'POST',
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
  const mail = await (
    await call(`/api/preview/outbox?to=${email}`)
  ).json<{
    subject: string;
  }>();
  const res = await call('/api/auth/sign-in/email-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp: mail.subject.slice(0, 6), name: 'Ada' }),
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const { user } = await res.json<{ user: { id: string } }>();
  const { token } = await (
    await call('/api/auth/token', { headers: { Cookie: cookie } })
  ).json<{
    token: string;
  }>();
  return { cookie, token, id: user.id };
}

beforeEach(() => {
  background = [];
  ({ env, sql } = sqliteD1(SIGN_IN));
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  resetSessionKeyCache();
  vi.restoreAllMocks();
});

describe('sign-in at the front door', () => {
  it('reports the methods in the capabilities', async () => {
    const caps = await (await call('/api/capabilities')).json<Record<string, unknown>>();
    expect(caps).toMatchObject({
      authEnabled: true,
      signInMethods: ['email-code'],
      googleClientId: null,
    });
  });

  it('serves no /api/auth and no outbox on a host with no keys', async () => {
    env = sqliteD1({}).env;
    expect((await call('/api/auth/get-session')).status).toBe(404);
    expect((await call('/api/preview/outbox?to=a@b.c')).status).toBe(404);
    const caps = await (await call('/api/capabilities')).json<Record<string, unknown>>();
    expect(caps).toMatchObject({ authEnabled: false, signInMethods: [] });
  });

  it('treats a session token as the account, for administration too', async () => {
    const { token } = await signIn('ada@example.com');
    const res = await call('/api/tokens', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
  });

  it('falls through to the guest header for a token that does not verify', async () => {
    const res = await call('/api/tokens', { headers: { Authorization: 'Bearer not-a-session' } });
    expect(res.status).not.toBe(200);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[auth] session_token_rejected'),
    );
  });

  it('serves the guest behind a bearer that is not a session token', async () => {
    const guest = await (
      await call('/api/guest-id', { method: 'POST' })
    ).json<{
      ownerId: string;
      ownerSig: string | null;
    }>();
    const res = await call('/api/documents', {
      headers: {
        Authorization: 'Bearer not-a-session',
        'X-Owner-Id': guest.ownerId,
        ...(guest.ownerSig ? { 'X-Owner-Sig': guest.ownerSig } : {}),
      },
    });
    expect(res.status).toBe(200);
  });

  it("moves a signed guest's data into the account it signs in to", async () => {
    const guest = await (
      await call('/api/guest-id', { method: 'POST' })
    ).json<{
      ownerId: string;
      ownerSig: string;
    }>();
    expect(guest.ownerSig).toEqual(expect.any(String));
    const asGuest = { 'X-Owner-Id': guest.ownerId, 'X-Owner-Sig': guest.ownerSig };
    const made = await call('/api/folders', {
      method: 'POST',
      headers: asGuest,
      body: JSON.stringify({ id: 'folder-1', name: 'Built as a guest' }),
    });
    expect(made.status).toBe(201);

    const { token } = await signIn('ada@example.com');
    const bearer = { Authorization: `Bearer ${token}` };
    const unsigned = await call('/api/migrate', {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({ guestOwnerId: guest.ownerId }),
    });
    expect(unsigned.status).toBe(403);
    const moved = await call('/api/migrate', {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({ guestOwnerId: guest.ownerId, guestSignature: guest.ownerSig }),
    });
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({ migrated: { folders: 1 } });

    const mine = await (
      await call('/api/folders', { headers: bearer })
    ).json<{
      folders: { name: string }[];
    }>();
    expect(mine.folders.map((f) => f.name)).toEqual(['Built as a guest']);
    const again = await call('/api/migrate', {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({ guestOwnerId: guest.ownerId, guestSignature: guest.ownerSig }),
    });
    expect(await again.json()).toEqual({
      migrated: { documents: 0, folders: 0, shared: 0, images: 0 },
    });
  });

  it('refuses an unsigned guest on owner-scoped routes once sign-in is on', async () => {
    const res = await call('/api/folders', {
      headers: { 'X-Owner-Id': '0f5ca4af-9a8a-4a60-be5e-1179e5555880' },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'signature_required' });
    expect(console.warn).toHaveBeenCalledWith('[auth] guest_signature_refused route=folders');
  });

  it('signs nothing on a guest-only host, and serves the unsigned guest', async () => {
    env = sqliteD1({}).env;
    const guest = await (
      await call('/api/guest-id', { method: 'POST' })
    ).json<{
      ownerId: string;
      ownerSig: string | null;
    }>();
    expect(guest.ownerSig).toBeNull();
    const res = await call('/api/folders', { headers: { 'X-Owner-Id': guest.ownerId } });
    expect(res.status).toBe(200);
  });

  it('refuses an account id presented as the guest header', async () => {
    const { id } = await signIn('ada@example.com');
    const res = await call('/api/documents', { headers: { 'X-Owner-Id': id } });
    expect(res.status).toBe(401);
  });

  it('deletes the data, then the identity, and signs the browser out', async () => {
    const { token, cookie, id } = await signIn('ada@example.com');
    const res = await call('/api/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(sql.prepare('SELECT COUNT(*) AS n FROM identity_users WHERE id = ?').get(id)).toEqual({
      n: 0,
    });
    expect(sql.prepare('SELECT COUNT(*) AS n FROM identity_sessions').get()).toEqual({ n: 0 });
    const session = await call('/api/auth/get-session', { headers: { Cookie: cookie } });
    expect(await session.json()).toBeNull();
  });

  it('sends the goodbye to the address the account had, once', async () => {
    const { token } = await signIn('grace@example.com');
    const del = () =>
      call('/api/account', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    expect((await del()).status).toBe(200);
    await Promise.all(background);
    const mail = await (
      await call('/api/preview/outbox?to=grace@example.com')
    ).json<{
      subject: string;
    }>();
    expect(mail.subject).toContain('has been deleted');
    const sent = () =>
      sql
        .prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE subject LIKE '%has been deleted%'")
        .get();
    expect(sent()).toEqual({ n: 1 });
    // Deleting again finds no account, so nobody is told twice.
    await del();
    await Promise.all(background);
    expect(sent()).toEqual({ n: 1 });
  });

  it("refuses administration to a deleted account's token still within its 15 minutes", async () => {
    const { token } = await signIn('ada@example.com');
    const bearer = { Authorization: `Bearer ${token}` };
    expect((await call('/api/account', { method: 'DELETE', headers: bearer })).status).toBe(200);

    for (const [method, path] of [
      ['GET', '/api/tokens'],
      ['POST', '/api/teams'],
      ['DELETE', '/api/account'],
      ['POST', '/api/migrate'],
    ] as const) {
      const res = await call(path, { method, headers: bearer });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(await res.json()).toEqual({ error: 'account_not_found' });
    }
    expect(console.warn).toHaveBeenCalledWith('[auth] account_not_found route=tokens');
  });

  it('refuses to delete for a session older than ten minutes', async () => {
    const { token } = await signIn('ada@example.com');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000);
    const res = await call('/api/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: 'SESSION_NOT_FRESH' });
  });
});

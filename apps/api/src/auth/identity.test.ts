import { afterEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import { handleAuth } from '../routes/auth';
import { handlePreviewOutbox } from '../routes/preview-outbox';
import type { Env } from '../types';
import { createIdentity, identityOptions, UNUSED_CODE_PATHS } from './identity';
import { getAccountSession, resetSessionKeyCache } from './session-token';

const ORIGIN = 'https://docs.test';
const SIGN_IN_ENV = {
  BETTER_AUTH_SECRET: 's'.repeat(40),
  APP_BASE_URL: ORIGIN,
  EMAIL_OUTBOX: '1',
} as Partial<Env>;

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

function cookieOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function codeFor(env: Env, email: string): Promise<string> {
  const res = await handlePreviewOutbox(
    new Request(`${ORIGIN}/api/preview/outbox?to=${encodeURIComponent(email)}`),
    env,
  );
  const { subject } = await res.json<{ subject: string }>();
  return subject.slice(0, 6);
}

// Signs `email` in with a code, as the browser does, and answers the session cookie.
async function signIn(
  env: Env,
  email: string,
  name?: string,
): Promise<{ cookie: string; body: SignedIn }> {
  const sent = await handleAuth(
    post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }),
    env,
  );
  expect(sent.status).toBe(200);
  const otp = await codeFor(env, email);
  const res = await handleAuth(
    post('/api/auth/sign-in/email-otp', { email, otp, ...(name ? { name } : {}) }),
    env,
  );
  expect(res.status).toBe(200);
  return { cookie: cookieOf(res), body: await res.json<SignedIn>() };
}

type SignedIn = { user: { id: string; name: string; emailVerified: boolean } };

afterEach(() => {
  resetSessionKeyCache();
  vi.restoreAllMocks();
});

describe('identity', () => {
  it('is null on a host with no secret, and has no options there', () => {
    expect(createIdentity({ APP_BASE_URL: ORIGIN } as Env)).toBeNull();
    expect(() => identityOptions({ APP_BASE_URL: ORIGIN } as Env)).toThrow('sign-in is off');
  });

  it('keeps better-auth telemetry and its own rate limiter off, and stores no IP', () => {
    const options = identityOptions({ ...SIGN_IN_ENV } as Env);
    expect(options.telemetry).toEqual({ enabled: false });
    expect(options.rateLimit).toEqual({ enabled: false });
    expect(options.advanced?.ipAddress).toEqual({ disableIpTracking: true });
    expect(options.advanced?.useSecureCookies).toBe(true);
  });

  it('lets Google go where an email code is a way back in, and keeps it on a host with Google alone', () => {
    const google = {
      GOOGLE_AUTH_CLIENT_ID: 'id.apps.googleusercontent.com',
      GOOGLE_AUTH_CLIENT_SECRET: 'g',
    };
    const withEmail = identityOptions({ ...SIGN_IN_ENV, ...google } as Env);
    expect(withEmail.account?.accountLinking?.allowUnlinkingAll).toBe(true);
    const googleOnly = identityOptions({ ...SIGN_IN_ENV, ...google, EMAIL_OUTBOX: '' } as Env);
    expect(googleOnly.account?.accountLinking?.allowUnlinkingAll).toBe(false);
  });

  it('rotates secrets, offers Google when keyed, and mints account ids for users only', () => {
    const options = identityOptions({
      ...SIGN_IN_ENV,
      BETTER_AUTH_SECRETS:
        '2:nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn,1:oooooooooooooooooooooooooooooooooooooooo',
      GOOGLE_AUTH_CLIENT_ID: 'gid',
      GOOGLE_AUTH_CLIENT_SECRET: 'gsecret',
    } as Env);
    expect(options.secrets).toEqual([
      { version: 2, value: 'n'.repeat(40) },
      { version: 1, value: 'o'.repeat(40) },
    ]);
    expect(options.socialProviders?.google).toMatchObject({
      clientId: 'gid',
      clientSecret: 'gsecret',
    });
    const generateId = options.advanced?.database?.generateId as (o: { model: string }) => string;
    expect(generateId({ model: 'user' })).toMatch(/^acct_/);
    expect(generateId({ model: 'session' })).toMatch(/^[0-9A-Za-z]{32}$/);
    expect(
      identityOptions({ ...SIGN_IN_ENV, APP_BASE_URL: 'http://localhost:4000' } as Env).advanced
        ?.useSecureCookies,
    ).toBe(false);
  });

  it('sends Google sign-in to Google with this host as the way back, asking only who the person is', async () => {
    const { env } = sqliteD1({
      ...SIGN_IN_ENV,
      GOOGLE_AUTH_CLIENT_ID: '123-abc.apps.googleusercontent.com',
      GOOGLE_AUTH_CLIENT_SECRET: 'g-secret',
    });
    const res = await handleAuth(
      post('/api/auth/sign-in/social', { provider: 'google', callbackURL: '/explorer/recent' }),
      env,
    );
    expect(res.status).toBe(200);
    const { url } = await res.json<{ url: string }>();
    const google = new URL(url);
    expect(google.origin).toBe('https://accounts.google.com');
    expect(google.searchParams.get('client_id')).toBe('123-abc.apps.googleusercontent.com');
    expect(google.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback/google`);
    expect(google.searchParams.get('scope')?.split(' ').sort()).toEqual([
      'email',
      'openid',
      'profile',
    ]);
    expect(google.searchParams.get('prompt')).toBe('select_account');
    expect(google.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('refuses a Google round trip that would come back to another site', async () => {
    const { env } = sqliteD1({
      ...SIGN_IN_ENV,
      GOOGLE_AUTH_CLIENT_ID: '123-abc.apps.googleusercontent.com',
      GOOGLE_AUTH_CLIENT_SECRET: 'g-secret',
    });
    const res = await handleAuth(
      post('/api/auth/sign-in/social', {
        provider: 'google',
        callbackURL: 'https://evil.example/x',
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('signs up with an email code, then proves the account to the api with a session token', async () => {
    const { env, sql } = sqliteD1(SIGN_IN_ENV);
    const { cookie, body } = await signIn(env, 'Ada@Example.com', 'Ada Lovelace');

    expect(body.user.id).toMatch(/^acct_[0-9A-Za-z]{24}$/);
    expect(body.user.emailVerified).toBe(true);
    expect(body.user.name).toBe('Ada Lovelace');
    expect(cookie).toContain('__Secure-livedoc.session_token=');
    const session = sql.prepare('SELECT ipAddress FROM identity_sessions').get() as {
      ipAddress: string | null;
    };
    expect(session.ipAddress ?? '').toBe('');

    const tokenRes = await handleAuth(
      new Request(`${ORIGIN}/api/auth/token`, { headers: { Cookie: cookie } }),
      env,
    );
    expect(tokenRes.status).toBe(200);
    const { token } = await tokenRes.json<{ token: string }>();

    const account = await getAccountSession(env, token);
    expect(account).toMatchObject({
      accountId: body.user.id,
      email: 'ada@example.com',
      emailVerified: true,
    });
    expect(account!.authTime).toBeGreaterThan(0);
  });

  it('signs a returning address into the same account', async () => {
    const { env } = sqliteD1(SIGN_IN_ENV);
    const first = await signIn(env, 'grace@example.com', 'Grace');
    const second = await signIn(env, 'grace@example.com');
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it('refuses a wrong code', async () => {
    const { env } = sqliteD1(SIGN_IN_ENV);
    await handleAuth(
      post('/api/auth/email-otp/send-verification-otp', {
        email: 'x@example.com',
        type: 'sign-in',
      }),
      env,
    );
    const res = await handleAuth(
      post('/api/auth/sign-in/email-otp', { email: 'x@example.com', otp: '000000' }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('checks a code only by signing in with it, so guesses can\u2019t race the attempt count', async () => {
    const { env } = sqliteD1(SIGN_IN_ENV);
    const email = 'ada@example.com';
    await handleAuth(
      post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }),
      env,
    );
    const otp = await codeFor(env, email);
    const wrong = otp === '000000' ? '111111' : '000000';
    const guesses = await Promise.all(
      Array.from({ length: 12 }, () =>
        handleAuth(
          post('/api/auth/email-otp/check-verification-otp', {
            email,
            type: 'sign-in',
            otp: wrong,
          }),
          env,
        ),
      ),
    );
    expect(guesses.map((r) => r.status)).toEqual(Array(12).fill(404));
    const check = await handleAuth(
      post('/api/auth/email-otp/check-verification-otp', { email, type: 'sign-in', otp }),
      env,
    );
    expect(check.status).toBe(404);
    const signedIn = await handleAuth(post('/api/auth/sign-in/email-otp', { email, otp }), env);
    expect(signedIn.status).toBe(200);
  });

  it('turns off every code route but sending one and signing in with it', async () => {
    const { env } = sqliteD1(SIGN_IN_ENV);
    for (const path of UNUSED_CODE_PATHS) {
      const res = await handleAuth(
        post(`/api/auth${path}`, { email: 'bea@example.com', otp: '123456', type: 'sign-in' }),
        env,
      );
      expect(res.status, path).toBe(404);
    }
  });

  it('joins a Google sign-in to an account only when Google verified the address', () => {
    const options = identityOptions({
      ...SIGN_IN_ENV,
      GOOGLE_AUTH_CLIENT_ID: 'id',
      GOOGLE_AUTH_CLIENT_SECRET: 'secret',
    } as Env);
    // A trusted provider is linked on an address it never verified; Google is never one.
    expect(options.account?.accountLinking?.trustedProviders ?? []).toEqual([]);
    expect(options.account?.accountLinking?.enabled).toBe(true);
  });

  it('answers 502 EMAIL_SEND_FAILED when the code cannot be sent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env } = sqliteD1({
      ...SIGN_IN_ENV,
      EMAIL_OUTBOX: undefined,
      EMAIL: {
        send: async () => {
          throw Object.assign(new Error('nope'), { code: 'E_SENDER_NOT_VERIFIED' });
        },
      },
    });
    const res = await handleAuth(
      post('/api/auth/email-otp/send-verification-otp', {
        email: 'y@example.com',
        type: 'sign-in',
      }),
      env,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'EMAIL_SEND_FAILED' });
  });

  it('refuses a cookie-bearing request from another origin', async () => {
    const { env } = sqliteD1(SIGN_IN_ENV);
    const { cookie } = await signIn(env, 'z@example.com', 'Z');
    const res = await handleAuth(
      post(
        '/api/auth/sign-out',
        {},
        { Cookie: cookie, Origin: 'https://feat-x.preview.docs.test' },
      ),
      env,
    );
    expect(res.status).toBe(403);
  });
});

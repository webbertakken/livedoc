// The session token (docs/specs/014-identity/auth-and-guest-access.md "Sessions"): a 15-minute EdDSA JWT
// better-auth's `jwt` plugin signs at GET /api/auth/token, sent by the browser
// as `Authorization: Bearer`. Verified here in-process against the public keys in `identity_jwks`, never by an
// HTTP fetch of our own JWKS (a Worker fetching itself is better-auth issue #10888).
//
// Returns null for anything that is not a valid session token, so the caller falls through to the guest header:
// the guest path must always serve. Every rejection is logged with a stable reason, never the token.
import { isAccountIdShape } from '@livedoc/api-schema';
import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
  type JWK,
} from 'jose';
import type { Env } from '../types';
import { identityConfigOf } from './identity-config';

// Seconds of clock skew allowed on exp / nbf. Safe range: 0 to 30.
export const SESSION_TOKEN_SKEW_S = 5;
// How long an isolate trusts the keys it read. A key id it does not hold forces one re-read (a rotation).
// Safe range: 60 s to 1 h.
export const JWKS_CACHE_MS = 300_000;
// How long a rotated-out key keeps verifying: better-auth's default grace period (30 days).
export const JWKS_GRACE_S = 2_592_000;

export type AccountSession = {
  accountId: string;
  email: string | null;
  emailVerified: boolean;
  // When the session was created (seconds): how fresh a sign-in is.
  authTime: number | null;
};

type KeyCache = { keys: JSONWebKeySet; readAt: number };
let cache: KeyCache | null = null;

// For tests: forget the cached keys.
export function resetSessionKeyCache(): void {
  cache = null;
}

async function readKeys(env: Env, now: number): Promise<JSONWebKeySet> {
  const { results } = await env.DB.prepare(
    'SELECT id, publicKey, alg, expiresAt FROM identity_jwks',
  ).all<{
    id: string;
    publicKey: string;
    alg: string | null;
    expiresAt: string | number | null;
  }>();
  const keys = results.flatMap((row) => {
    // A key past its expiry still verifies for JWKS_GRACE_S, as better-auth's own verifier allows.
    if (row.expiresAt !== null && new Date(row.expiresAt).getTime() + JWKS_GRACE_S * 1000 < now)
      return [];
    try {
      const jwk = JSON.parse(row.publicKey) as unknown;
      if (typeof jwk !== 'object' || jwk === null) return [];
      return [{ ...(jwk as JWK), kid: row.id, alg: row.alg ?? 'EdDSA' }];
    } catch {
      return [];
    }
  });
  cache = { keys: { keys }, readAt: now };
  return cache.keys;
}

async function keysFor(env: Env, kid: string | undefined, now: number): Promise<JSONWebKeySet> {
  const fresh = cache && now - cache.readAt < JWKS_CACHE_MS;
  if (fresh && cache!.keys.keys.some((k) => k.kid === kid)) return cache!.keys;
  console.info(`[auth] jwks_reloaded reason=${fresh ? 'kid_miss' : 'ttl'}`);
  return readKeys(env, now);
}

function rejectionReason(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^ERR_[A-Z_]+$/.test(code) ? code : 'unknown';
}

export async function getAccountSession(
  env: Env,
  token: string,
  now = Date.now(),
): Promise<AccountSession | null> {
  const { origin } = identityConfigOf(env);
  if (!origin) return null;
  try {
    const { kid } = decodeProtectedHeader(token);
    const jwks = createLocalJWKSet(await keysFor(env, kid, now));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: origin,
      audience: origin,
      algorithms: ['EdDSA'],
      clockTolerance: SESSION_TOKEN_SKEW_S,
      currentDate: new Date(now),
    });
    if (typeof payload.sub !== 'string' || !isAccountIdShape(payload.sub)) {
      console.warn('[auth] session_token_rejected reason=not_account_id');
      return null;
    }
    const email =
      typeof payload.email === 'string' && payload.email.length > 0
        ? payload.email.trim().toLowerCase()
        : null;
    const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : null;
    return {
      accountId: payload.sub,
      email,
      emailVerified: payload.email_verified === true,
      authTime,
    };
  } catch (err) {
    console.warn(`[auth] session_token_rejected reason=${rejectionReason(err)}`);
    return null;
  }
}

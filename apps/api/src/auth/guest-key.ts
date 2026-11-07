// The guest signing key (docs/specs/014-identity/auth-and-guest-access.md "Signed guest ids"): HKDF(SHA-256,
// the sign-in secret, salt 'livedoc', info 'livedoc-guest-id'), imported as an HMAC key. One
// secret turns sign-in on and signs guest ids, and the two never sign the same bytes. Null on a host with no usable
// secret: a guest-only host signs nothing and needs nothing signed.
import type { Env } from '../types';
import { MIN_SECRET_LENGTH, versionedSecrets } from './identity-config';

const enc = new TextEncoder();
const HKDF_SALT = enc.encode('livedoc');
const HKDF_INFO = enc.encode('livedoc-guest-id');

// Which secret the key derives from. A guest's signature lives in its browser for good, so the key must outlast a
// rotation of the sign-in secret, or every guest would be locked out of their own documents by one. The rule is
// therefore the OLDEST usable secret, never the current one:
//
//   1. BETTER_AUTH_SECRET, which better-auth keeps reading as its legacy secret once BETTER_AUTH_SECRETS takes over
//      (a rotation adds versions and leaves it in place);
//   2. else the lowest version in BETTER_AUTH_SECRETS, the entry a rotation retires last.
//
// Usable means what sign-in accepts: trimmed, at least MIN_SECRET_LENGTH characters. With sign-in on, the secret it
// signs with is one of these candidates, so a key always exists when sign-in is on. Retiring the secret the key
// derives from re-keys every guest; the operator docs say so.
export function guestKeySecret(env: Env): string | null {
  const candidates = [
    env.BETTER_AUTH_SECRET?.trim() ?? '',
    ...versionedSecrets(env)
      .filter((entry) => Number.isInteger(entry.version))
      .sort((a, b) => a.version - b.version)
      .map((entry) => entry.value),
  ];
  return candidates.find((secret) => secret.length >= MIN_SECRET_LENGTH) ?? null;
}

// One derivation per secret per isolate: guest requests are the hot path (an editor autosaves every ~600 ms).
let cached: { secret: string; key: Promise<CryptoKey> } | null = null;

async function deriveGuestKey(secret: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: HKDF_INFO },
    ikm,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
}

export async function guestSigningKey(env: Env): Promise<CryptoKey | null> {
  const secret = guestKeySecret(env);
  if (!secret) return null;
  if (cached?.secret !== secret) cached = { secret, key: deriveGuestKey(secret) };
  return cached.key;
}

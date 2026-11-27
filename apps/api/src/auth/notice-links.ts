// The signed link in a text document's notification email (docs/specs/034-text-documents/review.md "Notifications",
// In every email): it names one person and one document, and changes that person's setting for that document alone,
// without signing in. The key is HKDF(SHA-256, the sign-in secret guest ids derive from, salt 'livedoc', info
// 'livedoc-notice-link'): the oldest usable secret, so a link in an old email outlives a rotation, and never the bytes
// a guest id is signed with. A host with no secret signs nothing, and its emails carry only the account-wide link.
import { base64ToBytes, bytesToBase64Url } from '@livedoc/api-schema';
import type { Env } from '../types';
import { guestKeySecret } from './guest-key';
import { timingSafeEqual } from './timing-safe';

const enc = new TextEncoder();
const dec = new TextDecoder();
const HKDF_SALT = enc.encode('livedoc');
const HKDF_INFO = enc.encode('livedoc-notice-link');

/** Whose setting for which document a link changes. */
export type NoticeLinkSubject = { readonly ownerId: string; readonly documentId: string };

let cached: { secret: string; key: Promise<CryptoKey> } | null = null;

async function deriveKey(secret: string): Promise<CryptoKey> {
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

function linkKey(env: Env): Promise<CryptoKey> | null {
  const secret = guestKeySecret(env);
  if (!secret) return null;
  if (cached?.secret !== secret) cached = { secret, key: deriveKey(secret) };
  return cached.key;
}

async function sign(key: CryptoKey, payload: string): Promise<string> {
  return bytesToBase64Url(await crypto.subtle.sign('HMAC', key, enc.encode(`notices:${payload}`)));
}

/** The link's token for this person and document; null on a host with no key. */
export async function noticeLinkToken(
  env: Env,
  subject: NoticeLinkSubject,
): Promise<string | null> {
  const key = linkKey(env);
  if (!key) return null;
  const payload = bytesToBase64Url(
    enc.encode(JSON.stringify([subject.ownerId, subject.documentId])),
  );
  return `${payload}.${await sign(await key, payload)}`;
}

function subjectOf(payload: string): NoticeLinkSubject | null {
  const bytes = base64ToBytes(payload);
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(dec.decode(bytes));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [ownerId, documentId] = parsed as unknown[];
    if (typeof ownerId !== 'string' || typeof documentId !== 'string' || !ownerId || !documentId)
      return null;
    return { ownerId, documentId };
  } catch {
    return null;
  }
}

/** Whose setting a token changes, when its signature holds; null for anything else, and on a host with no key. */
export async function readNoticeLinkToken(
  env: Env,
  token: string,
): Promise<NoticeLinkSubject | null> {
  const key = linkKey(env);
  const [payload, sig, extra] = token.split('.');
  if (!key || !payload || !sig || extra !== undefined) return null;
  if (!(await timingSafeEqual(await sign(await key, payload), sig))) return null;
  return subjectOf(payload);
}

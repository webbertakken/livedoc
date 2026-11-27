import { describe, expect, it } from 'vitest';
import { bytesToBase64Url } from '@livedoc/api-schema';
import type { Env } from '../types';
import { noticeLinkToken, readNoticeLinkToken } from './notice-links';
import { signOwnerId } from './owner-signature';

// docs/specs/034-text-documents/review.md "Notifications" (In every email): a link signed for one person and one
// document.

const env = { BETTER_AUTH_SECRET: 's'.repeat(40) } as Env;
const other = { BETTER_AUTH_SECRET: 't'.repeat(40) } as Env;
const subject = { ownerId: 'ada', documentId: 'doc.1' };
const payloadOf = (value: unknown) =>
  bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));

describe('notice links', () => {
  it('read back whose setting for which document they change', async () => {
    const token = (await noticeLinkToken(env, subject))!;
    expect(token).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(await readNoticeLinkToken(env, token)).toEqual(subject);
  });

  it('sign nothing, and read nothing, on a host with no key', async () => {
    expect(await noticeLinkToken({} as Env, subject)).toBeNull();
    const token = (await noticeLinkToken(env, subject))!;
    expect(await readNoticeLinkToken({} as Env, token)).toBeNull();
  });

  it('refuse a token another key signed, or one changed', async () => {
    const token = (await noticeLinkToken(env, subject))!;
    expect(await readNoticeLinkToken(other, token)).toBeNull();
    const [, sig] = token.split('.');
    const forged = `${payloadOf(['bo', 'doc.1'])}.${sig}`;
    expect(await readNoticeLinkToken(env, forged)).toBeNull();
    expect(await readNoticeLinkToken(env, `${token}.more`)).toBeNull();
    expect(await readNoticeLinkToken(env, 'no-dot')).toBeNull();
    expect(await readNoticeLinkToken(env, '.sig')).toBeNull();
  });

  it('never share their bytes with a guest id’s signature', async () => {
    const guest = await signOwnerId(env, 'notices:x');
    expect(await readNoticeLinkToken(env, `x.${guest}`)).toBeNull();
  });

  it('refuse a signed payload that names no person and document', async () => {
    // Signed with the real key through the public door, then the payload swapped for each malformed one and signed
    // again is impossible from outside; so the shapes are checked by signing them the way the module does.
    const { webcrypto } = await import('node:crypto');
    const enc = new TextEncoder();
    const ikm = await webcrypto.subtle.importKey('raw', enc.encode('s'.repeat(40)), 'HKDF', false, [
      'deriveKey',
    ]);
    const key = await webcrypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: enc.encode('livedoc'),
        info: enc.encode('livedoc-notice-link'),
      },
      ikm,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    );
    const signed = async (payload: string) =>
      `${payload}.${bytesToBase64Url(await webcrypto.subtle.sign('HMAC', key, enc.encode(`notices:${payload}`)))}`;
    for (const payload of [
      payloadOf({ ownerId: 'ada' }),
      payloadOf(['ada']),
      payloadOf(['ada', 7]),
      payloadOf(['', 'doc']),
      bytesToBase64Url(enc.encode('not json')),
      '*not-base64*',
    ])
      expect(await readNoticeLinkToken(env, await signed(payload))).toBeNull();
    expect(await readNoticeLinkToken(env, await signed(payloadOf(['ada', 'doc'])))).toEqual({
      ownerId: 'ada',
      documentId: 'doc',
    });
  });
});

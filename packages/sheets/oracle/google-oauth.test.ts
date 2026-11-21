import { FakeGoogle } from '@livedoc/fake-google';
import { sentForm } from '@livedoc/vitest-config/sent-request';
import { describe, expect, it } from 'vitest';
import {
  accessTokenOf,
  consentSecrets,
  consentUrl,
  exchangeCode,
  randomBytes,
  readOAuthClient,
  redirectOutcome,
  type Fetch,
} from './google-oauth.ts';

// formulas.md "The oracle": the token and Consent (D95).

const client = { clientId: 'id.apps.googleusercontent.com', clientSecret: 'secret' };
const counting = (size: number) => Uint8Array.from({ length: size }, (_, i) => i * 7);

describe('readOAuthClient', () => {
  it("reads a Desktop app client's installed block", () => {
    expect(
      readOAuthClient({ installed: { client_id: 'a', client_secret: 'b', project_id: 'p' } }),
    ).toEqual({ ok: true, client: { clientId: 'a', clientSecret: 'b' } });
  });

  it('refuses a web client, nothing, and a block without its secret', () => {
    expect(readOAuthClient({ web: {} })).toMatchObject({ ok: false, problem: /installed/ });
    expect(readOAuthClient(null)).toMatchObject({ ok: false });
    expect(readOAuthClient({ installed: { client_id: 'a' } })).toMatchObject({
      ok: false,
      problem: /client_secret/,
    });
  });
});

describe('consentSecrets', () => {
  it("makes PKCE's S256 challenge of a 43-character verifier, and a state", async () => {
    const { verifier, challenge, state } = await consentSecrets(counting);
    expect(verifier).toMatch(/^[\w-]{43}$/);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    expect(challenge).toBe(Buffer.from(digest).toString('base64url'));
    expect(state).toMatch(/^[\w-]{22}$/);
  });

  it('draws fresh bytes each time', async () => {
    expect(randomBytes(16)).toHaveLength(16);
    const [a, b] = await Promise.all([consentSecrets(randomBytes), consentSecrets(randomBytes)]);
    expect(a.state).not.toBe(b.state);
  });
});

describe('consentUrl', () => {
  it('asks for drive.file only, offline, again, with PKCE and the state', () => {
    const url = new URL(
      consentUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:5',
        challenge: 'ch',
        state: 'st',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      redirect_uri: 'http://127.0.0.1:5',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      state: 'st',
    });
  });
});

describe('redirectOutcome', () => {
  const at = (query: string) => redirectOutcome(new URL(`http://127.0.0.1:1/?${query}`), 'st');

  it('takes its own code', () => {
    expect(at('state=st&code=c1')).toEqual({ kind: 'code', code: 'c1' });
  });

  it('refuses a foreign or missing state before anything else', () => {
    expect(at('state=other&code=c1')).toEqual({ kind: 'foreign' });
    expect(at('code=c1')).toEqual({ kind: 'foreign' });
  });

  it("names Google's refusal and a redirect without a code", () => {
    expect(at('state=st&error=access_denied')).toEqual({
      kind: 'refused',
      problem: 'Google answered access_denied',
    });
    expect(at('state=st')).toEqual({ kind: 'refused', problem: 'the redirect brought no code' });
  });
});

describe('the token endpoint', () => {
  it('exchanges a code for the refresh token, and that for an access token', async () => {
    const fake = new FakeGoogle();
    const exchanged = await exchangeCode(fake.fetch, {
      client,
      code: fake.consent('me'),
      verifier: 'v',
      redirectUri: 'http://127.0.0.1:1',
    });
    if (!exchanged.ok) throw new Error(exchanged.problem);
    const access = await accessTokenOf(fake.fetch, client, exchanged.token);
    expect(access).toMatchObject({ ok: true, token: expect.stringMatching(/^ya29\./) });
  });

  it('sends the code, its verifier and the redirect, form-encoded', async () => {
    let sent = new URLSearchParams();
    const fetch: Fetch = async (_url, init) => {
      sent = sentForm(init);
      return Response.json({ refresh_token: 'r' });
    };
    await exchangeCode(fetch, { client, code: 'c', verifier: 'v', redirectUri: 'http://x' });
    expect(Object.fromEntries(sent)).toEqual({
      grant_type: 'authorization_code',
      client_id: client.clientId,
      client_secret: 'secret',
      code: 'c',
      code_verifier: 'v',
      redirect_uri: 'http://x',
    });
  });

  it('names the status and error code, never the body', async () => {
    const fake = new FakeGoogle();
    expect(await accessTokenOf(fake.fetch, client, '1//revoked')).toEqual({
      ok: false,
      problem: 'the token endpoint answered 400 invalid_grant',
    });
    const bare: Fetch = async () => new Response('<html>secret</html>', { status: 500 });
    expect(await accessTokenOf(bare, client, 'r')).toEqual({
      ok: false,
      problem: 'the token endpoint answered 500',
    });
  });

  it('names an answer without its token', async () => {
    const fake = new FakeGoogle({ omitRefreshToken: true });
    const exchanged = await exchangeCode(fake.fetch, {
      client,
      code: fake.consent('me'),
      verifier: 'v',
      redirectUri: 'http://127.0.0.1:1',
    });
    expect(exchanged).toEqual({ ok: false, problem: 'the token endpoint gave no refresh_token' });
  });
});

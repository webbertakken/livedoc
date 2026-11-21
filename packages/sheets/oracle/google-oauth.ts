// The oracle's own Google OAuth client (docs/specs/029-sheets/formulas.md "The oracle": the token and Consent): its
// client file, Google's consent URL with PKCE and a state, the redirect's code, and the token endpoint's answers.
// Never says a secret, a code or a token: a failure names the endpoint's status and its `error` code alone.
// Imports nothing extensionless, so `node oracle/google-consent.ts` runs it as it stands.

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const ORACLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
// 32 random bytes make a 43-character verifier, RFC 7636's shortest; 16 make the state.
const VERIFIER_BYTES = 32;
const STATE_BYTES = 16;

export type OAuthClient = { clientId: string; clientSecret: string };
export type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type Random = (size: number) => Uint8Array;
export type TokenResult = { ok: true; token: string } | { ok: false; problem: string };

export const randomBytes: Random = (size) => crypto.getRandomValues(new Uint8Array(size));

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/** A Desktop app client's file as Google's console downloads it: its `installed` block. */
export function readOAuthClient(
  json: unknown,
): { ok: true; client: OAuthClient } | { ok: false; problem: string } {
  const installed = (json as { installed?: Record<string, unknown> } | null)?.installed;
  if (!installed)
    return { ok: false, problem: 'the client file has no installed block (a Desktop app)' };
  const { client_id: clientId, client_secret: clientSecret } = installed;
  if (typeof clientId !== 'string' || typeof clientSecret !== 'string')
    return { ok: false, problem: 'the client file has no client_id or client_secret' };
  return { ok: true, client: { clientId, clientSecret } };
}

/** PKCE's verifier and its S256 challenge (RFC 7636), and a random state. */
export async function consentSecrets(
  random: Random,
): Promise<{ verifier: string; challenge: string; state: string }> {
  const verifier = base64url(random(VERIFIER_BYTES));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return {
    verifier,
    challenge: base64url(new Uint8Array(digest)),
    state: base64url(random(STATE_BYTES)),
  };
}

/** Google's consent page for the oracle: `drive.file` only, offline, asked again, with PKCE and the state. */
export function consentUrl(input: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: ORACLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    state: input.state,
  }).toString();
  return url.toString();
}

/** What Google's redirect brought: its code, its refusal, or a state that is not this consent's. */
export type RedirectOutcome =
  { kind: 'code'; code: string } | { kind: 'refused'; problem: string } | { kind: 'foreign' };

export function redirectOutcome(url: URL, state: string): RedirectOutcome {
  if (url.searchParams.get('state') !== state) return { kind: 'foreign' };
  const error = url.searchParams.get('error');
  if (error) return { kind: 'refused', problem: `Google answered ${error}` };
  const code = url.searchParams.get('code');
  if (!code) return { kind: 'refused', problem: 'the redirect brought no code' };
  return { kind: 'code', code };
}

async function tokenCall(
  fetch: Fetch,
  form: Record<string, string>,
  field: 'refresh_token' | 'access_token',
): Promise<TokenResult> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const error = typeof body.error === 'string' ? ` ${body.error}` : '';
    return { ok: false, problem: `the token endpoint answered ${res.status}${error}` };
  }
  const token = body[field];
  if (typeof token !== 'string')
    return { ok: false, problem: `the token endpoint gave no ${field}` };
  return { ok: true, token };
}

/** The consent's code exchanged for the refresh token. */
export function exchangeCode(
  fetch: Fetch,
  input: { client: OAuthClient; code: string; verifier: string; redirectUri: string },
): Promise<TokenResult> {
  return tokenCall(
    fetch,
    {
      grant_type: 'authorization_code',
      client_id: input.client.clientId,
      client_secret: input.client.clientSecret,
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
    },
    'refresh_token',
  );
}

/** An hour's access token from the refresh token. */
export function accessTokenOf(
  fetch: Fetch,
  client: OAuthClient,
  refreshToken: string,
): Promise<TokenResult> {
  return tokenCall(
    fetch,
    {
      grant_type: 'refresh_token',
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
    },
    'access_token',
  );
}

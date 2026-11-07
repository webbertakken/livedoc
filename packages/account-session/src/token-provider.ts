import { authUrl, type ApiOptions } from './session';

// The session token provider (docs/specs/014-identity/auth-and-guest-access.md): the
// 15-minute token the browser sends to the rest of the api as `Authorization: Bearer`, fetched from
// `GET /api/auth/token` with the session cookie and kept until shortly before it expires.

// How long before a token's `exp` a fresh one is fetched (D16). Covers clock skew and a request in flight across
// the expiry. Safe range: 10 to 300 s.
export const SESSION_TOKEN_REFRESH_MARGIN_S = 60;

export type TokenProvider = {
  // The current session token, or null when signed out or the api could not be asked. `skipCache` fetches a fresh
  // one whatever is held.
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
  // The last token handed out, for the unload beacon, which cannot wait for a fetch.
  getLastKnownToken: () => string | null;
  // Forget the held token (sign-out, or a session that ended elsewhere).
  clear: () => void;
};

export type TokenProviderOptions = ApiOptions & {
  now?: () => number;
  // Called when `/api/auth/token` answers 401: the session ended (signed out elsewhere, expired, revoked).
  onSignedOut?: () => void;
};

export function createTokenProvider({
  apiBase,
  fetch: fetchImpl = fetch,
  now = Date.now,
  onSignedOut,
}: TokenProviderOptions): TokenProvider {
  let held: { token: string; expiresAtS: number } | null = null;
  let last: string | null = null;
  let inflight: Promise<string | null> | null = null;
  // Bumped by clear(), so a fetch that started before a sign-out never repopulates the cache after it.
  let generation = 0;

  async function fetchToken(): Promise<string | null> {
    const started = generation;
    let res: Response;
    try {
      res = await fetchImpl(authUrl(apiBase, 'token'), {
        cache: 'no-store',
        credentials: 'same-origin',
      });
    } catch {
      return null;
    }
    if (res.status === 401) {
      clear();
      onSignedOut?.();
      return null;
    }
    if (!res.ok) return null;
    const token = await res
      .json()
      .then((body: { token?: unknown }) => (typeof body?.token === 'string' ? body.token : null))
      .catch(() => null);
    if (!token || started !== generation) return token;
    const expiresAtS = expiryOf(token);
    held = expiresAtS === null ? null : { token, expiresAtS };
    last = token;
    return token;
  }

  function clear(): void {
    generation += 1;
    held = null;
    last = null;
    inflight = null;
  }

  return {
    getToken: (opts) => {
      if (
        !opts?.skipCache &&
        held &&
        held.expiresAtS - now() / 1000 > SESSION_TOKEN_REFRESH_MARGIN_S
      ) {
        return Promise.resolve(held.token);
      }
      if (!inflight) {
        const request = fetchToken().finally(() => {
          if (inflight === request) inflight = null;
        });
        inflight = request;
      }
      return inflight;
    },
    getLastKnownToken: () => last,
    clear,
  };
}

// The `exp` claim of a JWT, in seconds, read without verifying (the api verifies; this only schedules a refresh).
export function expiryOf(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

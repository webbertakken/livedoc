// The one sentence each sign-in failure shows (docs/specs/014-identity/auth-and-guest-access.md "Errors and
// edge cases"). The api answers with a code (`{ code, message }` from better-auth, or LiveDoc's own gates in front of
// it); the page shows the copy for that code, never the server's own wording, so the two never drift apart.

export const AUTH_ERROR_COPY = {
  EMAIL_SEND_FAILED: "We couldn't send the code. Try again in a minute.",
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
  INVALID_OTP: "That code isn't right. Check it, or use the newest code we sent.",
  OTP_EXPIRED: 'That code has expired. Send a new one.',
  TOO_MANY_ATTEMPTS: 'That code has been used up. Send a new one.',
  INVALID_EMAIL: 'Enter a valid email address.',
  INVALID_ORIGIN: "Sign-in works only at this site's main address. Open it there and try again.",
  account_not_linked:
    'That Google account isn\u2019t verified for this email. Sign in with an email code instead.',
  network: "We couldn't reach the server. Check your connection and try again.",
  unknown: 'Something went wrong. Try again.',
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_COPY;

// What an auth call failed with: better-auth's client error (`{ code?, status, message? }`), a thrown fetch, or a
// Google round trip's `?error=` code.
export function authErrorCopy(error: unknown): string {
  if (error instanceof TypeError) return AUTH_ERROR_COPY.network;
  const code =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : null;
  if (typeof code === 'string' && code in AUTH_ERROR_COPY)
    return AUTH_ERROR_COPY[code as AuthErrorCode];
  if (error && typeof error === 'object' && (error as { status?: unknown }).status === 429) {
    return AUTH_ERROR_COPY.RATE_LIMITED;
  }
  return AUTH_ERROR_COPY.unknown;
}

// A Google round trip that came back with `?error=`: whether to say anything at all. The person cancelling at
// Google (`access_denied`) is not an error worth a banner.
export function googleReturnError(code: string | null): string | null {
  if (!code || code === 'access_denied') return null;
  return authErrorCopy(code);
}

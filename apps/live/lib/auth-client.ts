'use client';

// better-auth's browser client (docs/specs/014-identity/auth-and-guest-access.md): the email-code
// and Google calls of the sign-in pages and the re-verification before deleting the account. Imported only by those
// surfaces, so the library lands in their own chunks and never in the editor's first load; every other page reads
// the session through the auth bridge's plain `fetch` (`@livedoc/account-session`).

import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { API_BASE } from '@/lib/api/base';

const AUTH_BASE = `${API_BASE}/auth`;

// Same origin by default (`/api/auth`, resolved against the page's origin); a build pointed at another api origin
// names it whole.
export const authClient = createAuthClient({
  ...(/^https?:\/\//.test(AUTH_BASE) ? { baseURL: AUTH_BASE } : { basePath: AUTH_BASE }),
  plugins: [emailOTPClient()],
});

export type AuthClient = typeof authClient;

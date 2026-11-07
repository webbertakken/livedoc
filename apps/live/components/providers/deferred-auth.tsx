'use client';

// The auth surface the app tree consumes (docs/specs/014-identity/auth-and-guest-access.md). AuthBridge reads the
// session and publishes this state; every page, the account menu and the settings read it here, never the session
// layer itself, so the tree stays free of any sign-in library and the workbench route can hold it unsettled.
//
// Until the bridge has read the session the defaults below say "not settled yet", which every consumer handles: a
// guest-only host settles to a guest as soon as `/api/auth/get-session` answers 404.

import { createContext, useContext } from 'react';
import type { DeleteAccountOutcome } from '@/lib/api/self';

export type { DeleteAccountOutcome };

// The account as the app renders it (the account menu, the Settings identity card, the bootstrap's display name).
export type DeferredAuthUser = {
  id: string;
  // The account's one name (Google's, or the one typed at sign-up), or null when it has none yet.
  name: string | null;
  email: string | null;
  createdAt: Date | null;
  // The resolved profile picture (docs/specs/014-identity/profile-picture.md), or null for the initials avatar.
  pictureUrl: string | null;
};

export type DeferredAuthState = {
  // True once auth has SETTLED: the session was read (signed in or not), or could not be read (offline, a guest).
  authLoaded: boolean;
  isSignedIn: boolean;
  accountId: string | null;
  user: DeferredAuthUser | null;
  // The session token getter; resolves null when signed out. Identity is stable once published. `skipCache` fetches
  // a fresh token instead of returning the held one.
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
  // Ends the session here and in every tab, then goes to `redirectUrl` when given.
  signOut: (opts?: { redirectUrl?: string }) => Promise<void>;
  // Reads the session again (after the account's name changed) and tells the other tabs. Absent when signed out.
  refreshSession?: () => Promise<void>;
  // Deletes the account, its data first (`DELETE /api/account`). Null when signed out.
  deleteAccount: (() => Promise<DeleteAccountOutcome>) | null;
  // True once a session this page held ended somewhere else (signed out in another browser or tab, expired, revoked),
  // so the page can say so rather than turn into a guest silently. False after this page's own sign-out.
  sessionEnded?: boolean;
};

// Not settled yet: what every page sees before the bridge has read the session.
export const DEFERRED_AUTH_DEFAULT: DeferredAuthState = {
  authLoaded: false,
  isSignedIn: false,
  accountId: null,
  user: null,
  getToken: async () => null,
  signOut: async () => {},
  deleteAccount: null,
};

// A settled guest: signed out, a guest-only host, or a session that could not be read.
export const DEFERRED_AUTH_GUEST: DeferredAuthState = {
  ...DEFERRED_AUTH_DEFAULT,
  authLoaded: true,
};

// Auth held unsettled, whatever the deployment: what the workbench page's surroundings read
// (docs/specs/013-workspace/workbench-embeds.md), so nothing
// above the editor ever reads as a settled guest; the editor itself reads WorkbenchAuthBridge's state.
export const DEFERRED_AUTH_PENDING: DeferredAuthState = {
  ...DEFERRED_AUTH_DEFAULT,
};

export const DeferredAuthContext = createContext<DeferredAuthState>(DEFERRED_AUTH_DEFAULT);

export function useDeferredAuth(): DeferredAuthState {
  return useContext(DeferredAuthContext);
}

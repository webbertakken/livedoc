'use client';

// Auth for the whole app tree (docs/specs/014-identity/auth-and-guest-access.md). Reads the session once on
// every load, guests included (D25), and publishes it as DeferredAuthState:
//
//   unsettled ──session read──▶ guest | signed-in | guest-offline
//   signed-in ──sign-out, or the token endpoint answers 401──▶ guest
//   any ──another tab announces an account change──▶ read again
//   guest-offline ──the browser comes back online──▶ read again
//
// The read also settles whether this host offers sign-in at all (auth-config.ts): `/api/auth/*` answers 404 on a
// guest-only host. Plain `fetch` through `@livedoc/account-session`: no sign-in library on any page's first
// load. The guest migration that follows a sign-in is the api bootstrap's (useAccountApiBootstrap).

import {
  announceAccountChange,
  createTokenProvider,
  onAccountChange,
  readSession,
  signOut as endSession,
  writeSignedInHint,
  type SessionState,
} from '@livedoc/account-session';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLatest } from '@/hooks/ui/useLatest';
import { resolveProfilePicture } from '@/lib/account-avatar';
import { apiDeleteAccount } from '@/lib/api/self';
import { API_BASE } from '@/lib/api/base';
import { publishSignInAvailability } from '@/lib/auth-config';
import { debugLog } from '@/lib/debug-log';
import { forgetRecentDiagrams } from '@/lib/recent-diagrams-snapshot';
import {
  DEFERRED_AUTH_DEFAULT,
  DEFERRED_AUTH_GUEST,
  DEFERRED_AUTH_PENDING,
  DeferredAuthContext,
  type DeferredAuthState,
} from './deferred-auth';

// The workbench page (docs/specs/013-workspace/workbench-embeds.md) is
// signed in by its workbench session, never by a browser session: the bridge stands down there and the state holds
// DEFERRED_AUTH_PENDING, so nothing above the page reads as a settled guest. WorkbenchAuthBridge publishes the
// session to the editor beneath.
const WORKBENCH_ROUTE = '/embed/workbench';

type Settled = SessionState;

export function AuthBridge({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const workbenchRoute = pathname?.startsWith(WORKBENCH_ROUTE) === true;
  // The settled session, and whether a signed-in one ended without this page signing out.
  const [{ session, ended: sessionEnded }, setBridge] = useState<BridgeState>(UNSETTLED);
  const sessionRef = useLatest(session);

  const settle = useCallback((next: Settled) => {
    if (next.status === 'off') publishSignInAvailability(false);
    else if (next.status !== 'unreachable') publishSignInAvailability(true);
    if (next.status === 'signed-in') writeSignedInHint(true);
    else if (next.status !== 'unreachable') writeSignedInHint(false);
    setBridge((prev) => advance(prev, next));
  }, []);

  // This page's own sign-out or deletion: not an ending to announce.
  const endHere = useCallback(() => {
    setBridge({ session: { status: 'signed-out' }, ended: false });
    writeSignedInHint(false);
  }, []);

  const tokens = useMemo(
    () =>
      createTokenProvider({
        apiBase: API_BASE,
        // The session ended elsewhere (signed out in another browser, expired, revoked).
        onSignedOut: () => {
          debugLog('[auth] session_ended source=token');
          settle({ status: 'signed-out' });
        },
      }),
    [settle],
  );

  const read = useCallback(
    () =>
      readSession({ apiBase: API_BASE }).then((next) => {
        if (next.status !== 'signed-in') tokens.clear();
        debugLog(`[auth] session_read status=${next.status}`);
        settle(next);
      }),
    [settle, tokens],
  );

  useEffect(() => {
    if (workbenchRoute) return;
    void read();
    const stop = onAccountChange(() => void read());
    const onOnline = () => {
      if (sessionRef.current?.status === 'unreachable') void read();
    };
    window.addEventListener('online', onOnline);
    return () => {
      stop();
      window.removeEventListener('online', onOnline);
    };
  }, [workbenchRoute, read, sessionRef]);

  const state = useMemo<DeferredAuthState>(() => {
    if (!session) return DEFERRED_AUTH_DEFAULT;
    if (session.status !== 'signed-in') {
      return sessionEnded ? { ...DEFERRED_AUTH_GUEST, sessionEnded: true } : DEFERRED_AUTH_GUEST;
    }
    const { user } = session;
    // Everything a session leaves behind in this browser, and every other tab told.
    const forget = async () => {
      tokens.clear();
      writeSignedInHint(false);
      announceAccountChange(false);
      // The landing page sign-out returns to must not show the account's recent diagrams
      // (docs/specs/019-marketing/returning-visitor.md); nor may it after the account is deleted.
      await forgetRecentDiagrams();
    };
    return {
      authLoaded: true,
      isSignedIn: true,
      accountId: user.id,
      user: {
        id: user.id,
        name: user.name.trim() || null,
        email: user.email,
        createdAt: user.createdAt,
        pictureUrl: resolveProfilePicture(user),
      },
      getToken: tokens.getToken,
      refreshSession: async () => {
        await read();
        announceAccountChange(true);
      },
      signOut: async (opts) => {
        if (!(await endSession({ apiBase: API_BASE }))) console.warn('[auth] sign_out_failed');
        await forget();
        endHere();
        if (opts?.redirectUrl) window.location.assign(opts.redirectUrl);
      },
      deleteAccount: async () => {
        // A fresh token first: after verifying again, the held one still carries the old sign-in time.
        await tokens.getToken({ skipCache: true });
        const outcome = await apiDeleteAccount();
        if (outcome === 'deleted') {
          await forget();
          endHere();
        }
        return outcome;
      },
    };
  }, [session, sessionEnded, endHere, tokens, read]);

  return (
    <DeferredAuthContext.Provider value={workbenchRoute ? DEFERRED_AUTH_PENDING : state}>
      {children}
    </DeferredAuthContext.Provider>
  );
}

type BridgeState = { session: Settled | null; ended: boolean };
const UNSETTLED: BridgeState = { session: null, ended: false };

// The next bridge state for a settled read: a signed-in session followed by a signed-out (or sign-in-off) answer has
// ended elsewhere; a signed-in answer clears that. The same answer keeps the state object.
function advance(prev: BridgeState, next: Settled): BridgeState {
  const endedNow =
    prev.session?.status === 'signed-in' && (next.status === 'signed-out' || next.status === 'off');
  const ended = next.status === 'signed-in' ? false : prev.ended || endedNow;
  const session = sameSession(prev.session, next) ? prev.session : next;
  return session === prev.session && ended === prev.ended ? prev : { session, ended };
}

// The same answer as before, so consumers keep the state they hold (a re-read on every tab focus or nudge must
// not re-render the app).
function sameSession(prev: Settled | null, next: Settled): boolean {
  if (!prev || prev.status !== next.status) return false;
  if (prev.status !== 'signed-in' || next.status !== 'signed-in') return true;
  const a = prev.user;
  const b = next.user;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.email === b.email &&
    a.emailVerified === b.emailVerified &&
    a.image === b.image
  );
}

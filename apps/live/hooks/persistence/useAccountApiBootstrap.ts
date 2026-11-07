'use client';

import { DEFERRED_AUTH_PENDING, useDeferredAuth } from '@/components/providers/deferred-auth';
import {
  useWorkbenchSession,
  type WorkbenchSession,
} from '@/components/providers/workbench-session-context';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { registerTokenProvider } from '@/lib/api-client';
import {
  guestMigrationPending,
  settleGuestMigration,
  subscribeGuestMigration,
} from '@/lib/guest-migration';

// Two things every page that talks to the api needs to do once the session is known
// (docs/specs/014-identity/auth-and-guest-access.md "Guest → account upgrade"):
//
//   1. Register the session token getter as the api-client's token provider, so every request carries
//      `Authorization: Bearer <session token>` instead of the guest header. Cleared on sign-out / unmount so the
//      guest path resumes cleanly.
//
//   2. Run the guest → account migration the first time the person is signed in AND a guest id is still in
//      `localStorage`: `POST /api/migrate` moves every guest-holdable row from the guest id to the account id. On
//      success the guest id is forgotten, so later loads skip the call. `authLoaded` stays false until the migration
//      settles, so no page reads owner data as the account while it still belongs to the guest id (issue #67).
//      lib/guest-migration.ts runs it once per page load.
//
// Returns the auth fields callers need, so there is exactly one place they come from per page.

type BootstrapResult = {
  isSignedIn: boolean | undefined;
  authLoaded: boolean;
  accountId: string | null | undefined;
  // The account's name, seeding the participant record on first load so a signed-in person never appears under the
  // random "Sleepy Lemur" placeholder, and locking the welcome-modal name input when joining someone else's
  // document (a visitor with an account cannot type a different display name). Null when the session has not
  // settled, the person signed out, or the account has no name yet.
  accountDisplayName: string | null;
};

// The editor in a workbench (docs/specs/013-workspace/workbench-embeds.md "The editor in a
// workbench", I9) is the session's person, settled at once: no guest migration, no timeout, no token
// provider here (WorkbenchAuthBridge registers the session's).
function workbenchResult(session: WorkbenchSession): BootstrapResult {
  return {
    isSignedIn: true,
    authLoaded: true,
    accountId: session.person.id,
    accountDisplayName: session.person.name,
  };
}

// Above the workbench page's editor the auth is held (DEFERRED_AUTH_PENDING): never settled, never a
// guest, however long it waits.
const HELD: BootstrapResult = {
  isSignedIn: false,
  authLoaded: false,
  accountId: null,
  accountDisplayName: null,
};

export function useAccountApiBootstrap(): BootstrapResult {
  const workbench = useWorkbenchSession();
  const auth = useDeferredAuth();
  const held = workbench !== null || auth === DEFERRED_AUTH_PENDING;
  const { getToken, isSignedIn, authLoaded: sessionLoaded, accountId, user } = auth;

  // If the session read has not answered within 5 s, settle as a guest rather than hang the canvas. Corporate proxies
  // (Zscaler, say) sometimes hold a request open for tens of seconds before failing. Until the read answers there is
  // no token provider, so the guest header is used; when it does answer signed in, the provider registers below and
  // later calls carry the session token.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (sessionLoaded || held) return;
    const id = window.setTimeout(() => setTimedOut(true), 5000);
    return () => window.clearTimeout(id);
  }, [sessionLoaded, held]);
  // 2. Guest → account migration. Read as an external store, so the very
  // first signed-in render already holds `authLoaded` and settling
  // releases it (see subscribeGuestMigration for why a re-render alone
  // is not enough under the React Compiler).
  const migrating = useSyncExternalStore(
    subscribeGuestMigration,
    () => !held && !!isSignedIn && !!accountId && guestMigrationPending(accountId),
    () => false,
  );
  useEffect(() => {
    if (held || !isSignedIn || !accountId) return;
    void settleGuestMigration(accountId);
  }, [held, isSignedIn, accountId]);
  const authLoaded = (sessionLoaded || timedOut) && !migrating;

  const accountDisplayName = user?.name ?? null;

  // 1. Token provider registration. The signed-in user's email is no
  // longer forwarded as a header — team-invite matching trusts only the
  // verified `email` session-token claim server-side (docs/specs/013-workspace/teams.md).
  //
  // A LAYOUT effect on purpose. React runs a child's passive effects before
  // its parent's, and the render that flips `isSignedIn` is the same one that
  // hands children the account id as their owner (the Explorer's
  // CustomThemeProvider, say). With a plain useEffect, that child's first
  // fetch went out before the provider existed, so apiHeaders fell back to
  // `X-Owner-Id: <account id>`, which the worker refuses with a 401 (an account id
  // is never a guest credential). Every layout effect runs before any
  // passive one, so the provider is in place by the time a child fetches.
  //
  // Registered, not set: the page, AuthControls and the Settings rows each
  // mount this hook, and one of them unmounting must leave the others'
  // Bearer in place (see registerTokenProvider).
  useLayoutEffect(() => {
    if (held || !isSignedIn) return;
    return registerTokenProvider((opts) => getToken(opts));
  }, [held, isSignedIn, getToken]);

  if (workbench) return workbenchResult(workbench);
  if (held) return HELD;
  return { isSignedIn, authLoaded, accountId, accountDisplayName };
}

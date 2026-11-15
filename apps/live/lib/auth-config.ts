'use client';

import { readSignInOffered, writeSignInOffered } from '@livedoc/account-session';
import type { SignInMethod } from '@livedoc/api-schema';
import { useEffect, useSyncExternalStore } from 'react';
import { apiGetCapabilities } from '@/lib/api/capabilities';

// Whether this host offers sign-in, and how (docs/specs/014-identity/auth-and-guest-access.md "Deployment modes": the
// frontends ask; nothing is baked in). One static build serves a guest-only host and a signed-in one alike, so the
// answer is known at runtime only, from two sources that agree:
//
//   - the auth bridge's session read on every page (`GET /api/auth/get-session` answers 404 on a guest-only host),
//     which settles `signIn` for the whole app tree;
//   - `GET /api/capabilities`, asked only by the surfaces that need the methods (the auth pages, Settings), which
//     names `signInMethods`, the public Google client id and whether codes land in the preview outbox.
//
// Until either answers, `signIn` is 'unknown' and every surface reads it as "no sign-in": nothing offers a sign-in
// that might not exist.

export type AuthConfig = {
  signIn: 'unknown' | 'on' | 'off';
  methods: readonly SignInMethod[];
  googleClientId: string | null;
  // Codes go to the preview outbox, not a mailbox (previews and the e2e stack).
  emailOutbox: boolean;
};

export const AUTH_CONFIG_UNKNOWN: AuthConfig = {
  signIn: 'unknown',
  methods: [],
  googleClientId: null,
  emailOutbox: false,
};

let current: AuthConfig = AUTH_CONFIG_UNKNOWN;
let capabilitiesAsked = false;
const listeners = new Set<() => void>();

function publish(next: AuthConfig): void {
  if (
    next.signIn === current.signIn &&
    next.googleClientId === current.googleClientId &&
    next.emailOutbox === current.emailOutbox &&
    next.methods.join() === current.methods.join()
  ) {
    return;
  }
  if (next.signIn !== current.signIn && next.signIn !== 'unknown') {
    // Kept so a page that must decide before the session read answers (where `/new` saves a guest's document)
    // need not wait for it. Only ever a default: the live answer replaces it.
    writeSignInOffered(next.signIn === 'on');
  }
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readAuthConfig(): AuthConfig {
  return current;
}

// Whether this host offers sign-in: the live answer once there is one, else the last one this browser saw, else
// null (a browser that has never asked).
export function signInOfferedHere(): boolean | null {
  if (current.signIn !== 'unknown') return current.signIn === 'on';
  return readSignInOffered();
}

// The bridge's answer: whether `/api/auth/*` exists on this host.
export function publishSignInAvailability(on: boolean): void {
  publish({ ...current, signIn: on ? 'on' : 'off' });
}

// Ask the capabilities once per page (a failed answer is asked again by the next caller). An answer without
// `authEnabled` (the fail-closed stand-in for an unreachable api, or an older worker) leaves `signIn` to the bridge.
export function loadAuthConfig(): Promise<void> {
  if (capabilitiesAsked) return Promise.resolve();
  capabilitiesAsked = true;
  return apiGetCapabilities().then((caps) => {
    if (typeof caps.authEnabled !== 'boolean') {
      capabilitiesAsked = false;
      return;
    }
    publish({
      signIn: caps.authEnabled ? 'on' : 'off',
      methods: caps.authEnabled ? (caps.signInMethods ?? []) : [],
      googleClientId: caps.googleClientId ?? null,
      emailOutbox: caps.emailOutbox === true,
    });
  });
}

// The whole configuration, asking the capabilities for the methods. For the auth pages and Settings.
export function useAuthConfig(): AuthConfig {
  useEffect(() => {
    void loadAuthConfig();
  }, []);
  return useSyncExternalStore(subscribe, readAuthConfig, () => AUTH_CONFIG_UNKNOWN);
}

// Whether to offer anything that needs an account (a sign-in link, the account menu, tokens). Settled by the auth
// bridge's session read; false while unknown.
export function useSignInAvailable(): boolean {
  return useSignInMode() === 'on';
}

// The mode itself, for a surface that says something different on a host without sign-in and must say nothing
// until it knows which.
export function useSignInMode(): AuthConfig['signIn'] {
  return useSyncExternalStore(
    subscribe,
    () => current.signIn,
    () => 'unknown',
  );
}

// Tests only: a fresh page.
export function resetAuthConfigForTests(): void {
  current = AUTH_CONFIG_UNKNOWN;
  capabilitiesAsked = false;
  listeners.clear();
}

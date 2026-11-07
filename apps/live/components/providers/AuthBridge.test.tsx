// @vitest-environment jsdom

// The auth bridge (docs/specs/014-identity/auth-and-guest-access.md): one
// session read on every load, guests included; the states it settles to; the hint and the nudge between tabs;
// signing out and deleting the account; and standing down on the workbench route.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/explorer/recent' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
const forgetRecentDiagrams = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/recent-diagrams-snapshot', () => ({ forgetRecentDiagrams }));
const apiDeleteAccount = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/self', () => ({ apiDeleteAccount }));

import { ACCOUNT_CHANNEL_NAME, SIGNED_IN_HINT_KEY } from '@livedoc/account-session';
import { readAuthConfig, resetAuthConfigForTests } from '@/lib/auth-config';
import { AuthBridge } from './AuthBridge';
import { DEFERRED_AUTH_PENDING, useDeferredAuth, type DeferredAuthState } from './deferred-auth';

const USER = {
  id: 'acct_abcdefghijklmnopqrstuvwx',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  emailVerified: true,
  image: 'https://lh3.googleusercontent.com/a/ada=s96-c',
  createdAt: '2026-10-25T12:00:00.000Z',
};
const SIGNED_IN = { user: USER, session: { createdAt: '2026-10-25T12:30:00.000Z' } };

type Answer = { status: number; body?: unknown } | 'offline';
let answers: Record<string, Answer[]>;
let fetchMock: ReturnType<typeof vi.fn>;

function answer(path: string, ...next: Answer[]): void {
  answers[path] = [...(answers[path] ?? []), ...next];
}

function token(expInS: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInS }));
  return `h.${payload.replace(/=+$/, '')}.s`;
}

const probe: { state: DeferredAuthState | null } = { state: null };
function Probe() {
  const state = useDeferredAuth();
  useEffect(() => {
    probe.state = state;
  });
  return null;
}

function mount() {
  return render(
    <AuthBridge>
      <Probe />
    </AuthBridge>,
  );
}

beforeEach(() => {
  answers = {};
  route.pathname = '/explorer/recent';
  localStorage.clear();
  resetAuthConfigForTests();
  fetchMock = vi.fn(async (url: string) => {
    const queue = answers[url];
    const next = queue && queue.length > 1 ? queue.shift()! : queue?.[0];
    if (!next) throw new Error(`unexpected fetch ${url}`);
    if (next === 'offline') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify('body' in next ? next.body : {}), { status: next.status });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  apiDeleteAccount.mockReset();
  forgetRecentDiagrams.mockClear();
});

describe('AuthBridge', () => {
  it('holds every page unsettled until the session has been read', () => {
    answer('/api/auth/get-session', { status: 200, body: null });
    mount();
    expect(probe.state!.authLoaded).toBe(false);
  });

  it('settles a guest when nobody is signed in, and says sign-in exists here', async () => {
    answer('/api/auth/get-session', { status: 200, body: null });
    mount();
    await waitFor(() => expect(probe.state!.authLoaded).toBe(true));
    expect(probe.state!).toMatchObject({
      isSignedIn: false,
      accountId: null,
      user: null,
      deleteAccount: null,
    });
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe('0');
    expect(readAuthConfig().signIn).toBe('on');
    expect(await probe.state!.getToken()).toBeNull();
  });

  it('settles a guest on a guest-only host, and says sign-in does not exist here', async () => {
    answer('/api/auth/get-session', { status: 404 });
    mount();
    await waitFor(() => expect(probe.state!.authLoaded).toBe(true));
    expect(probe.state!.isSignedIn).toBe(false);
    expect(readAuthConfig().signIn).toBe('off');
  });

  it('publishes the account, and hands out its session token', async () => {
    answer('/api/auth/get-session', { status: 200, body: SIGNED_IN });
    const issued = token(900);
    answer('/api/auth/token', { status: 200, body: { token: issued } });
    mount();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
    expect(probe.state!).toMatchObject({
      authLoaded: true,
      accountId: USER.id,
      user: {
        id: USER.id,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        createdAt: new Date(USER.createdAt),
        pictureUrl: USER.image,
      },
    });
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe('1');
    expect(await probe.state!.getToken()).toBe(issued);
  });

  it('reads a name-less account as having no name yet', async () => {
    answer('/api/auth/get-session', {
      status: 200,
      body: { ...SIGNED_IN, user: { ...USER, name: ' ' } },
    });
    mount();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
    expect(probe.state!.user?.name).toBeNull();
  });

  it('settles a guest when the session cannot be read, and reads again once back online', async () => {
    answer('/api/auth/get-session', 'offline', { status: 200, body: SIGNED_IN });
    mount();
    await waitFor(() => expect(probe.state!.authLoaded).toBe(true));
    expect(probe.state!.isSignedIn).toBe(false);
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBeNull();
    expect(readAuthConfig().signIn).toBe('unknown');
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
  });

  it('ignores coming back online when the session was read', async () => {
    answer('/api/auth/get-session', { status: 200, body: null });
    mount();
    await waitFor(() => expect(probe.state!.authLoaded).toBe(true));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reads again when another tab says the account changed', async () => {
    answer('/api/auth/get-session', { status: 200, body: null }, { status: 200, body: SIGNED_IN });
    mount();
    await waitFor(() => expect(probe.state!.authLoaded).toBe(true));
    const other = new BroadcastChannel(ACCOUNT_CHANNEL_NAME);
    other.postMessage({ signedIn: true });
    other.close();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
  });

  it('keeps the published state when a read answers the same', async () => {
    answer('/api/auth/get-session', { status: 200, body: SIGNED_IN });
    mount();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
    const before = probe.state!;
    const other = new BroadcastChannel(ACCOUNT_CHANNEL_NAME);
    other.postMessage({ signedIn: true });
    other.close();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(probe.state!).toBe(before);
  });

  it('becomes a guest when the session ends elsewhere', async () => {
    answer('/api/auth/get-session', { status: 200, body: SIGNED_IN });
    answer('/api/auth/token', { status: 401 });
    mount();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
    await act(async () => {
      expect(await probe.state!.getToken()).toBeNull();
    });
    expect(probe.state!.isSignedIn).toBe(false);
    expect(probe.state!.sessionEnded).toBe(true);
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe('0');
  });

  it('says the session ended when another tab signed it out', async () => {
    answer('/api/auth/get-session', { status: 200, body: SIGNED_IN }, { status: 200, body: null });
    mount();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
    const other = new BroadcastChannel(ACCOUNT_CHANNEL_NAME);
    other.postMessage({ signedIn: false, from: 'another-tab' });
    other.close();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(false));
    expect(probe.state!.sessionEnded).toBe(true);
  });

  it('signs out here and in every tab, then goes where it was asked', async () => {
    answer('/api/auth/get-session', { status: 200, body: SIGNED_IN });
    answer('/api/auth/sign-out', { status: 200, body: { success: true } });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const nudges: unknown[] = [];
    const other = new BroadcastChannel(ACCOUNT_CHANNEL_NAME);
    other.onmessage = (event) => nudges.push(event.data);
    mount();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
    await act(async () => {
      await probe.state!.signOut({ redirectUrl: '/' });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/sign-out',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(probe.state!.isSignedIn).toBe(false);
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe('0');
    expect(forgetRecentDiagrams).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith('/');
    expect(probe.state!.sessionEnded).toBeFalsy();
    await waitFor(() => expect(nudges).toEqual([{ signedIn: false, from: expect.any(String) }]));
    other.close();
  });

  it('still forgets the session here when the api cannot end it, and says so', async () => {
    answer('/api/auth/get-session', { status: 200, body: SIGNED_IN });
    answer('/api/auth/sign-out', 'offline');
    mount();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
    await act(async () => {
      await probe.state!.signOut();
    });
    expect(console.warn).toHaveBeenCalledWith('[auth] sign_out_failed');
    expect(probe.state!.isSignedIn).toBe(false);
  });

  it('deletes the account with a fresh token, then forgets it here', async () => {
    answer('/api/auth/get-session', { status: 200, body: SIGNED_IN });
    answer('/api/auth/token', { status: 200, body: { token: token(900) } });
    apiDeleteAccount.mockResolvedValueOnce('deleted');
    mount();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await probe.state!.deleteAccount!();
    });
    expect(outcome).toBe('deleted');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/token', expect.anything());
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe('0');
    expect(probe.state!.isSignedIn).toBe(false);
    expect(forgetRecentDiagrams).toHaveBeenCalledOnce();
  });

  it('keeps the session when the api asks to verify again first', async () => {
    answer('/api/auth/get-session', { status: 200, body: SIGNED_IN });
    answer('/api/auth/token', { status: 200, body: { token: token(900) } });
    apiDeleteAccount.mockResolvedValueOnce('not-fresh');
    mount();
    await waitFor(() => expect(probe.state!.isSignedIn).toBe(true));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await probe.state!.deleteAccount!();
    });
    expect(outcome).toBe('not-fresh');
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe('1');
    expect(forgetRecentDiagrams).not.toHaveBeenCalled();
  });

  it('stands down on the workbench route', async () => {
    route.pathname = '/embed/workbench/';
    mount();
    await act(async () => {});
    expect(probe.state!).toBe(DEFERRED_AUTH_PENDING);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const caps = vi.hoisted(() => ({ answer: {} as Record<string, unknown> }));
vi.mock('@/lib/api/capabilities', () => ({
  apiGetCapabilities: vi.fn(async () => caps.answer),
}));

import { SIGN_IN_OFFERED_KEY } from '@livedoc/account-session';
import { apiGetCapabilities } from '@/lib/api/capabilities';
import {
  AUTH_CONFIG_UNKNOWN,
  loadAuthConfig,
  publishSignInAvailability,
  readAuthConfig,
  resetAuthConfigForTests,
  signInOfferedHere,
  useAuthConfig,
  useSignInAvailable,
  useSignInMode,
} from './auth-config';

beforeEach(() => {
  resetAuthConfigForTests();
  localStorage.clear();
  caps.answer = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('auth config (docs/specs/014-identity/auth-and-guest-access.md "Deployment modes")', () => {
  it('reads as no sign-in until something answers', () => {
    const { result } = renderHook(() => useSignInAvailable());
    expect(result.current).toBe(false);
    expect(readAuthConfig()).toBe(AUTH_CONFIG_UNKNOWN);
  });

  it('follows the bridge, which learns it from the session read', () => {
    const mode = renderHook(() => useSignInMode());
    expect(mode.result.current).toBe('unknown');
    const { result } = renderHook(() => useSignInAvailable());
    act(() => publishSignInAvailability(true));
    expect(result.current).toBe(true);
    act(() => publishSignInAvailability(false));
    expect(result.current).toBe(false);
    expect(mode.result.current).toBe('off');
    expect(readAuthConfig().signIn).toBe('off');
  });

  it('asks the capabilities for the methods, once', async () => {
    caps.answer = {
      authEnabled: true,
      signInMethods: ['google', 'email-code'],
      googleClientId: 'client.apps.googleusercontent.com',
      emailOutbox: true,
    };
    const { result } = renderHook(() => useAuthConfig());
    await waitFor(() => expect(result.current.signIn).toBe('on'));
    expect(result.current).toEqual({
      signIn: 'on',
      methods: ['google', 'email-code'],
      googleClientId: 'client.apps.googleusercontent.com',
      emailOutbox: true,
    });
    await loadAuthConfig();
    expect(apiGetCapabilities).toHaveBeenCalledOnce();
  });

  it('offers no methods on a guest-only host', async () => {
    caps.answer = { authEnabled: false, signInMethods: ['email-code'] };
    await loadAuthConfig();
    expect(readAuthConfig()).toEqual({ ...AUTH_CONFIG_UNKNOWN, signIn: 'off' });
  });

  it('reads an older worker sparingly', async () => {
    caps.answer = { authEnabled: true };
    await loadAuthConfig();
    expect(readAuthConfig()).toEqual({
      signIn: 'on',
      methods: [],
      googleClientId: null,
      emailOutbox: false,
    });
  });

  it('leaves the answer to the bridge when the capabilities could not be read, and asks again later', async () => {
    caps.answer = { aiEnabled: false, emailEnabled: false };
    await loadAuthConfig();
    expect(readAuthConfig()).toBe(AUTH_CONFIG_UNKNOWN);
    caps.answer = { authEnabled: true, signInMethods: ['email-code'] };
    await loadAuthConfig();
    expect(readAuthConfig().methods).toEqual(['email-code']);
    expect(apiGetCapabilities).toHaveBeenCalledTimes(2);
  });

  it('does not wake subscribers for an answer that changes nothing', () => {
    const renders = vi.fn();
    renderHook(() => {
      renders();
      return useSignInAvailable();
    });
    act(() => publishSignInAvailability(true));
    const after = renders.mock.calls.length;
    act(() => publishSignInAvailability(true));
    expect(renders).toHaveBeenCalledTimes(after);
  });

  it('remembers the last answer for a page that must decide before the next one', () => {
    expect(signInOfferedHere()).toBeNull();
    act(() => publishSignInAvailability(false));
    expect(localStorage.getItem(SIGN_IN_OFFERED_KEY)).toBe('0');
    resetAuthConfigForTests();
    expect(signInOfferedHere()).toBe(false);
    localStorage.setItem(SIGN_IN_OFFERED_KEY, '1');
    expect(signInOfferedHere()).toBe(true);
    act(() => publishSignInAvailability(false));
    expect(signInOfferedHere()).toBe(false);
    expect(localStorage.getItem(SIGN_IN_OFFERED_KEY)).toBe('0');
  });
});

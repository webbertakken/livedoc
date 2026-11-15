// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// docs/specs/013-workspace/explorer-home.md "First run": read from the Explorer's lists, and never guessed while
// they load or after one failed.

const { host } = vi.hoisted(() => ({ host: { signIn: true } }));
vi.mock('@/lib/auth-config', () => ({
  useSignInAvailable: () => host.signIn,
}));

import { ExplorerProvider } from '../ExplorerContext';
import type { ExplorerStateValue } from '../useExplorerState';
import { useFirstRun } from './useFirstRun';

function wrap(over: Partial<Record<string, unknown>> = {}) {
  const value = {
    ownerId: 'me',
    loading: false,
    documents: [],
    shared: [],
    teamDocuments: [],
    offlineDocuments: [],
    accountId: null,
    failedReads: { documents: false, shared: false },
    ...over,
  } as unknown as ExplorerStateValue;
  return ({ children }: { children: ReactNode }) => (
    <ExplorerProvider value={value}>{children}</ExplorerProvider>
  );
}

beforeEach(() => {
  host.signIn = true;
});

describe('useFirstRun', () => {
  it('is never a first run outside the Explorer', () => {
    const { result } = renderHook(() => useFirstRun());
    expect(result.current).toEqual({ firstRun: false, offerSignIn: false, decided: true });
  });

  it('is a first run with nothing loaded, offering a guest the way back', () => {
    const { result } = renderHook(() => useFirstRun(), { wrapper: wrap() });
    expect(result.current).toEqual({ firstRun: true, offerSignIn: true, decided: true });
  });

  it('offers no sign-in to someone signed in, or where sign-in is off', () => {
    expect(
      renderHook(() => useFirstRun(), { wrapper: wrap({ accountId: 'user_1' }) }).result.current
        .offerSignIn,
    ).toBe(false);
    host.signIn = false;
    expect(renderHook(() => useFirstRun(), { wrapper: wrap() }).result.current.offerSignIn).toBe(
      false,
    );
  });

  it('is not a first run with a document', () => {
    const { result } = renderHook(() => useFirstRun(), {
      wrapper: wrap({ documents: [{ id: 'a' }] }),
    });
    expect(result.current.firstRun).toBe(false);
  });

  it('is not a first run while the lists load', () => {
    const { result } = renderHook(() => useFirstRun(), { wrapper: wrap({ loading: true }) });
    expect(result.current.firstRun).toBe(false);
    // Not decided either way yet: Home has not drawn what it will show.
    expect(result.current.decided).toBe(false);
  });

  it('is no first run when a list failed to load', () => {
    for (const failedReads of [
      { documents: true, shared: false },
      { documents: false, shared: true },
    ]) {
      const { result } = renderHook(() => useFirstRun(), { wrapper: wrap({ failedReads }) });
      expect(result.current.firstRun).toBe(false);
    }
  });
});

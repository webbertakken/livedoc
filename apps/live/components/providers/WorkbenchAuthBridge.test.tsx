// @vitest-environment jsdom

// The editor in a workbench is signed in by its session alone (docs/specs/013-workspace/workbench-embeds.md,
// I9): the bridge publishes the person before any
// child fetches; above it, the auth bridge stands down (it never reads the browser session) and nothing
// reads as a settled guest; and the bootstrap under the session runs no guest migration.

import { act, cleanup, render } from '@testing-library/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchSession } from './workbench-session-context';

const sessions = vi.hoisted(() => ({ reads: 0 }));
vi.mock('@livedoc/account-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@livedoc/account-session')>()),
  readSession: async () => {
    sessions.reads++;
    return { status: 'signed-out' };
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/embed/workbench/' }));
const { apiMigrateGuestData } = vi.hoisted(() => ({ apiMigrateGuestData: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  apiMigrateGuestData,
}));

const SECRET = `lvw_${'a'.repeat(43)}`;
const RENEWED = `lvw_${'b'.repeat(43)}`;

function sessionOf(secret = SECRET): WorkbenchSession {
  return {
    scope: 'document',
    shareCode: null,
    frame: null,
    secret,
    documentId: 'doc-1',
    tabId: null,
    origin: 'https://127.0.0.1:5175',
    level: 'edit',
    expiresAt: Date.now() + 60_000,
    person: { id: 'acct_1', name: 'Webber', color: '#0ea5e9', pictureUrl: null },
    workbenchName: 'Acme Editor',
    port: { origin: 'https://127.0.0.1:5175', send: vi.fn(), subscribe: vi.fn(), close: vi.fn() },
    ended: null,
    end: vi.fn(),
  };
}

// A fresh module graph per test: the api client and the guest migration hold module state.
async function load() {
  vi.resetModules();
  const [{ AuthBridge }, { WorkbenchAuthBridge }, auth, boot, core, migration] = await Promise.all([
    import('./AuthBridge'),
    import('./WorkbenchAuthBridge'),
    import('./deferred-auth'),
    import('@/hooks/persistence/useAccountApiBootstrap'),
    import('@/lib/api/core'),
    import('@/lib/guest-migration'),
  ]);
  return { AuthBridge, WorkbenchAuthBridge, auth, boot, core, migration };
}

// The first load transforms the module graph; every later one reuses it.
beforeAll(async () => {
  await load();
}, 60_000);

beforeEach(() => {
  sessions.reads = 0;
  apiMigrateGuestData.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WorkbenchAuthBridge', () => {
  it('publishes the session’s person to the editor', async () => {
    const { WorkbenchAuthBridge, auth, core } = await load();
    let seen: ReturnType<typeof auth.useDeferredAuth> | null = null;
    function Probe() {
      seen = auth.useDeferredAuth();
      return null;
    }

    render(
      <WorkbenchAuthBridge session={sessionOf()}>
        <Probe />
      </WorkbenchAuthBridge>,
    );

    expect(seen).toMatchObject({
      authLoaded: true,
      isSignedIn: true,
      accountId: 'acct_1',
      user: { id: 'acct_1', name: 'Webber', email: null },
      deleteAccount: null,
    });
    expect(await seen!.getToken()).toBe(SECRET);
    await expect(seen!.signOut()).resolves.toBeUndefined();
    core.setTokenProvider(null);
  });

  it('presents the session on a child’s very first request, and confines it', async () => {
    const { WorkbenchAuthBridge, core } = await load();
    let headers: Promise<HeadersInit> | null = null;
    function Child() {
      useLayoutEffect(() => {
        headers = core.apiHeaders('acct_1');
      }, []);
      return null;
    }

    render(
      <WorkbenchAuthBridge session={sessionOf()}>
        <Child />
      </WorkbenchAuthBridge>,
    );

    expect(await headers!).toEqual({ Authorization: `Bearer ${SECRET}` });
    expect(core.getWorkbenchConfinement()).toEqual({
      scope: 'document',
      documentId: 'doc-1',
      ownerId: 'acct_1',
    });
    core.setTokenProvider(null);
    core.setWorkbenchConfinement(null);
  });

  it('presents a renewed secret from then on, and lets go on unmount', async () => {
    const { WorkbenchAuthBridge, core } = await load();
    const tree = (secret: string) => (
      <WorkbenchAuthBridge session={sessionOf(secret)}>
        <span />
      </WorkbenchAuthBridge>
    );
    const { rerender, unmount } = render(tree(SECRET));

    rerender(tree(RENEWED));
    expect(await core.apiHeaders('acct_1')).toEqual({ Authorization: `Bearer ${RENEWED}` });

    unmount();
    expect(await core.apiHeaders('guest-1')).toEqual({ 'X-Owner-Id': 'guest-1' });
    core.setWorkbenchConfinement(null);
  });
});

describe('the workbench page’s surroundings', () => {
  it('never read as a settled guest, however long they wait', async () => {
    vi.useFakeTimers();
    const { AuthBridge, boot, auth } = await load();
    const seen: { loaded: boolean; signedIn: boolean | undefined; deferred: boolean }[] = [];
    function Above() {
      const r = boot.useAccountApiBootstrap();
      seen.push({
        loaded: r.authLoaded,
        signedIn: r.isSignedIn,
        deferred: auth.useDeferredAuth().authLoaded,
      });
      return null;
    }

    render(
      <AuthBridge>
        <Above />
      </AuthBridge>,
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(seen.every((s) => !s.loaded && !s.signedIn && !s.deferred)).toBe(true);
    expect(sessions.reads).toBe(0);
  });

  it('let the editor beneath settle as the person, with no guest migration', async () => {
    localStorage.setItem('livedoc:v2:self-id', 'guest-1');
    const { AuthBridge, WorkbenchAuthBridge, boot, core } = await load();
    let result: ReturnType<typeof boot.useAccountApiBootstrap> | null = null;
    function Editor() {
      result = boot.useAccountApiBootstrap();
      return null;
    }
    const page = (children: ReactNode) => (
      <AuthBridge>
        <WorkbenchAuthBridge session={sessionOf()}>{children}</WorkbenchAuthBridge>
      </AuthBridge>
    );

    render(page(<Editor />));
    await act(async () => {});

    expect(result).toEqual({
      isSignedIn: true,
      authLoaded: true,
      accountId: 'acct_1',
      accountDisplayName: 'Webber',
    });
    expect(apiMigrateGuestData).not.toHaveBeenCalled();
    expect(await core.apiHeaders('acct_1')).toEqual({ Authorization: `Bearer ${SECRET}` });
    core.setTokenProvider(null);
    core.setWorkbenchConfinement(null);
  });
});

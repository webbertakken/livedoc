// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';

// A document the Explorer has just made opens from memory (docs/specs/013-workspace/new-document-menu.md
// "The editor's bootstrap branch"): its state is seeded in the editor's first render (seed-pending-document.ts), so the
// bootstrap only notes the open, fetches nothing, and settles the reader once auth answers.

const { api } = vi.hoisted(() => ({
  api: {
    apiLoadSelf: vi.fn(),
    apiSaveSelf: vi.fn(),
    apiLoadDocument: vi.fn(),
    apiLoadShared: vi.fn(),
    apiListShareLinks: vi.fn(),
    apiLoadTabRevisioned: vi.fn(),
  },
}));
vi.mock('@/lib/api-client', () => ({
  ...api,
  getSessionSharePassword: () => null,
  readCachedShareGrant: () => null,
  setSessionSharePassword: () => {},
  writeCachedShareGrant: () => {},
}));
vi.mock('@/lib/guest-identity', () => ({ ensureSignedGuestIdentity: vi.fn() }));
vi.mock('@/lib/daily-return', () => ({ trackDailyReturn: () => {} }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/offline/offline-store', async (actual) => ({
  ...(await actual<typeof import('@/lib/offline/offline-store')>()),
  isOfflineId: vi.fn(async () => false),
}));

import { useIdentityBootstrap } from './useIdentityBootstrap';
import { getLoadProgress, resetLoadProgressForTests } from '@/lib/load-progress';
import {
  addPendingDocument,
  resetPendingDocumentsForTests,
} from '@/lib/new-document/pending-documents';
import { resetCreateHoldsForTests } from '@/lib/new-document/create-hold';

const ID = 'd0c0ffee-0000-4000-8000-0000000000aa';
const TABS = [{ id: 't1', name: 'Tab 1', elements: [] }] as unknown as Tab[];

function run() {
  const set = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (t, k: string) => (t[k] ??= vi.fn()),
  });
  const resetTabs = vi.fn();
  const lastSavedTabsRef = { current: [] as Tab[] };
  const props = (authLoaded: boolean) => ({
    authLoaded,
    passwordRetry: 0,
    // Seeded in the first render.
    hydrated: true,
    accountId: 'user_1',
    accountDisplayName: 'Pat',
    embed: false,
    workbench: null,
    activeId: 'x',
    selfParticipant: { id: 'self', name: 'Guest', color: '#000', status: 'online' as const },
    refreshDocumentList: vi.fn(),
    refreshSharedList: vi.fn(),
    resetTabs,
    refs: {
      lastPersistedSelfRef: { current: null },
      lastSavedTabsRef,
      lastSavedNameRef: { current: '' },
      loadedTabIdsRef: { current: new Set<string>() },
      noteChangesetSeen: () => {},
    },
    set: set as never,
  });
  const hook = renderHook(({ authLoaded }) => useIdentityBootstrap(props(authLoaded)), {
    initialProps: { authLoaded: false },
  });
  return { ...hook, set, resetTabs, lastSavedTabsRef };
}

beforeEach(() => {
  resetLoadProgressForTests();
  window.history.replaceState(null, '', `/document/${ID}`);
  api.apiLoadSelf.mockResolvedValue({ id: 'user_1', name: 'Pat', color: '#111' });
  addPendingDocument(
    {
      id: ID,
      name: 'Untitled Diagram',
      tabs: TABS,
      itemTypes: null,
      ownerId: 'user_1',
      location: 'livedoc',
      teamId: null,
      startedAt: 0,
    },
    () => new Promise(() => {}),
    {},
  );
});

afterEach(() => {
  resetPendingDocumentsForTests();
  resetCreateHoldsForTests();
  vi.clearAllMocks();
});

describe('useIdentityBootstrap for a document just made', () => {
  it('notes the open before auth, fetching and setting nothing', () => {
    const { set, resetTabs } = run();
    expect(getLoadProgress().step).toBe('done');
    expect(resetTabs).not.toHaveBeenCalled();
    expect(set.setHydrated).not.toHaveBeenCalled();
    expect(api.apiLoadDocument).not.toHaveBeenCalled();
    expect(api.apiLoadTabRevisioned).not.toHaveBeenCalled();
    expect(api.apiListShareLinks).not.toHaveBeenCalled();
  });

  it('settles the reader in the background once auth answers, never loading the document', async () => {
    const { rerender, set } = run();
    rerender({ authLoaded: true });
    await vi.waitFor(() => expect(api.apiLoadSelf).toHaveBeenCalledWith('user_1'));
    await vi.waitFor(() =>
      expect(set.setSelfParticipant).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'user_1', name: 'Pat' }),
      ),
    );
    expect(api.apiLoadDocument).not.toHaveBeenCalled();
    expect(set.setHydrated).not.toHaveBeenCalled();
  });
});

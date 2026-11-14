// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// docs/specs/016-platform/web-performance.md "The open path asks in parallel": once the reader's id is known, the
// document (or the share link) is asked for at once, beside the reader's participant row, never after it. The
// editor still shows only once both have answered, as the reader it resolved.

const { api, identity, seed } = vi.hoisted(() => ({
  api: {
    apiLoadSelf: vi.fn(),
    apiSaveSelf: vi.fn(),
    apiLoadDocument: vi.fn(),
    apiLoadShared: vi.fn(),
    apiListShareLinks: vi.fn(),
  },
  identity: { ensureCollabKey: vi.fn(() => 'collab'), hasConfirmedName: vi.fn(() => true) },
  seed: vi.fn(async () => {}),
}));

vi.mock('@/lib/api-client', () => ({
  ...api,
  getSessionSharePassword: () => null,
  readCachedShareGrant: () => null,
  setSessionSharePassword: () => {},
  writeCachedShareGrant: () => {},
}));
vi.mock('@/lib/local-identity', () => identity);
vi.mock('@/lib/guest-identity', () => ({
  ensureSignedGuestIdentity: async () => ({ id: 'guest-1' }),
}));
vi.mock('@/lib/daily-return', () => ({ trackDailyReturn: () => {} }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('./seed-fetched-document', () => ({ makeSeedFetchedDocument: () => seed }));
vi.mock('@/lib/timing', () => ({
  startEditorTiming: () => ({ end: () => {}, cancel: () => {}, endAfterPaint: () => {} }),
  documentLoadOrigin: () => 0,
  noteDocumentLoadEnded: () => {},
}));

import { useIdentityBootstrap } from './useIdentityBootstrap';
import { resetLoadProgressForTests } from '@/lib/load-progress';

type Setters = Record<string, ReturnType<typeof vi.fn>>;

function render(accountId: string | null = null) {
  const fns: Setters = {};
  const set = new Proxy(fns, {
    get: (t, k: string) => (t[k] ??= vi.fn()),
  });
  renderHook(() =>
    useIdentityBootstrap({
      authLoaded: true,
      passwordRetry: 0,
      hydrated: false,
      accountId,
      accountDisplayName: accountId ? 'Ann' : null,
      embed: false,
      workbench: null,
      activeId: 't1',
      selfParticipant: { id: 'self', name: 'x', color: '#000', status: 'online' },
      refreshDocumentList: () => {},
      refreshSharedList: () => {},
      resetTabs: () => {},
      refs: {
        lastPersistedSelfRef: { current: null },
        lastSavedTabsRef: { current: [] },
        lastSavedNameRef: { current: '' },
        loadedTabIdsRef: { current: new Set() },
        noteChangesetSeen: () => {},
      },
      set: set as never,
    }),
  );
  return fns;
}

const GUEST = { id: 'guest-1', name: 'G', color: '#111', status: 'online' as const };
const DOC = { id: 'doc-1', ownerId: 'guest-1', name: 'D', tabs: [] };

// A participant read that answers only when the test says so.
function heldSelf() {
  let answer!: (p: typeof GUEST | null) => void;
  api.apiLoadSelf.mockReturnValue(new Promise((r) => (answer = r)));
  return (p: typeof GUEST | null) => answer(p);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  resetLoadProgressForTests();
  api.apiSaveSelf.mockResolvedValue(undefined);
  api.apiListShareLinks.mockResolvedValue({ links: [], passwordSet: false });
  api.apiLoadDocument.mockResolvedValue(DOC);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('useIdentityBootstrap open path', () => {
  it('asks for the document while the participant row is still on its way', async () => {
    window.history.replaceState(null, '', '/document/doc-1');
    heldSelf();
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.apiLoadSelf).toHaveBeenCalledWith('guest-1');
    expect(api.apiLoadDocument).toHaveBeenCalledWith('guest-1', 'doc-1');
  });

  it('asks for the document as the account when signed in', async () => {
    window.history.replaceState(null, '', '/document/doc-1');
    heldSelf();
    render('user_1');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.apiLoadDocument).toHaveBeenCalledWith('user_1', 'doc-1');
  });

  it('follows a share link while the participant row is still on its way', async () => {
    window.history.replaceState(null, '', '/document/shared?s=CODE2345');
    heldSelf();
    api.apiLoadShared.mockReturnValue(new Promise(() => {}));
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.apiLoadShared).toHaveBeenCalledWith('CODE2345', 'guest-1');
  });

  it('asks for the document while a first visit saves its new participant row', async () => {
    window.history.replaceState(null, '', '/document/doc-1');
    api.apiLoadSelf.mockResolvedValue(null);
    api.apiSaveSelf.mockReturnValue(new Promise(() => {}));
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.apiLoadDocument).toHaveBeenCalledWith('guest-1', 'doc-1');
  });

  it('shows the editor only once the participant has answered, as that participant', async () => {
    window.history.replaceState(null, '', '/document/doc-1');
    const answer = heldSelf();
    const s = render();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.setLoadingDocument ?? vi.fn()).not.toHaveBeenCalledWith(false);
    expect(seed).not.toHaveBeenCalled();
    answer(GUEST);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.setSelfParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'guest-1', name: 'G' }),
    );
    expect(s.setLoadingDocument).toHaveBeenCalledWith(false);
    const adopted = s.setSelfParticipant!.mock.invocationCallOrder[0]!;
    const shown = s.setLoadingDocument!.mock.invocationCallOrder.at(-1)!;
    expect(adopted).toBeLessThan(shown);
  });

  it('asks for the document once, however the participant answers', async () => {
    window.history.replaceState(null, '', '/document/doc-1');
    api.apiLoadSelf.mockResolvedValue(GUEST);
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.apiLoadDocument).toHaveBeenCalledTimes(1);
  });
});

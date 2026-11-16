// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OwnerControlsState } from './owner-controls-watch';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));
const { clearRecentClientErrors, recentClientErrors } =
  await import('@/lib/bug-report/recent-errors');
const { useOwnerControlsWatch } = await import('./owner-controls-watch');

// docs/specs/006-document/document-structure.md "An owner shown greyed controls is logged".

const greyed: OwnerControlsState = {
  ready: true,
  documentOwnerId: 'acct_owner',
  accountId: 'acct_owner',
  selfId: 'guest-1',
  isOwner: false,
  canDeleteDocument: false,
  sessionRole: 'edit',
  hasShareCode: false,
  teamDocument: false,
  workbench: false,
  otherDocuments: 3,
  addTargets: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
  track.mockClear();
  clearRecentClientErrors(window.sessionStorage);
});

describe('useOwnerControlsWatch', () => {
  it('logs an owner shown greyed controls once, to the console, telemetry and the bug report', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = renderHook((s: OwnerControlsState) => useOwnerControlsWatch('doc-1', s), {
      initialProps: greyed,
    });
    rerender({ ...greyed });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toMatch(
      /^\[owner-controls-greyed\] OwnerControlsGreyed delete=greyed add=greyed /,
    );
    expect(track).toHaveBeenCalledExactlyOnceWith('Error', 'Warning', 'OwnerControlsGreyed');
    const [recorded] = recentClientErrors(window.sessionStorage).slice(-1);
    expect(recorded).toMatchObject({ source: 'warning' });
    expect(recorded!.message).toMatch(
      /delete=greyed add=greyed isOwner=0 role=edit .* reader=guest docs=3$/,
    );
  });

  it('logs a document again only once, coming back to it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = renderHook(({ id }: { id: string }) => useOwnerControlsWatch(id, greyed), {
      initialProps: { id: 'doc-1' },
    });
    rerender({ id: 'doc-2' });
    rerender({ id: 'doc-1' });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('logs nothing while the owner has every control, or with no document', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() =>
      useOwnerControlsWatch('doc-1', {
        ...greyed,
        isOwner: true,
        canDeleteDocument: true,
        addTargets: 3,
      }),
    );
    renderHook(() => useOwnerControlsWatch(null, greyed));
    expect(warn).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
});

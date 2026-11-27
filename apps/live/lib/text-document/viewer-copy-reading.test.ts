import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/core';
import {
  isViewerCopyUnavailable,
  openingFailure,
  resettingOnCopyChange,
  VIEWER_COPY_UNAVAILABLE_COPY,
} from './viewer-copy-reading';

// docs/specs/034-text-documents/review.md "What a Viewer receives"; live-editing-and-storage.md "A Viewer's copy": a
// catch-up from a copy the room let go opens the tab again; a copy that cannot be made is said, never worked around.

describe('resettingOnCopyChange', () => {
  it('passes a catch-up through', async () => {
    const answer = { update: Uint8Array.of(1), stateVector: Uint8Array.of(0) };
    const reset = vi.fn();
    const load = resettingOnCopyChange(async () => answer, reset);
    expect(await load(Uint8Array.of(0))).toBe(answer);
    expect(reset).not.toHaveBeenCalled();
  });

  it('opens the tab again when the copy it holds is gone, and still fails the catch-up', async () => {
    const reset = vi.fn();
    const changed = new ApiError('text document state', 409, 'viewer_copy_changed');
    const load = resettingOnCopyChange(() => Promise.reject(changed), reset);
    await expect(load(Uint8Array.of(0))).rejects.toBe(changed);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('leaves any other failure to the catch-up', async () => {
    const reset = vi.fn();
    const other = new ApiError('text document state', 503, 'room_unavailable');
    const load = resettingOnCopyChange(() => Promise.reject(other), reset);
    await expect(load(Uint8Array.of(0))).rejects.toBe(other);
    expect(reset).not.toHaveBeenCalled();
  });
});

describe('openingFailure', () => {
  it('names a copy that cannot be made apart from any other failure', () => {
    const unavailable = new ApiError('text document state', 503, 'viewer_copy_unavailable');
    expect(isViewerCopyUnavailable(unavailable)).toBe(true);
    expect(openingFailure(unavailable)).toBe(VIEWER_COPY_UNAVAILABLE_COPY);
    expect(VIEWER_COPY_UNAVAILABLE_COPY).toBe("This document can't be shown right now.");
    expect(openingFailure(new Error('offline'))).toBe('This text document could not be opened.');
  });
});

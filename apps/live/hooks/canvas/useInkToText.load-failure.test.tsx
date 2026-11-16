// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { packFreehandPoints, type FreehandElement } from '@livedoc/document';
import { useInkToText } from './useInkToText';

// docs/specs/023-draw-mode/ink-to-text.md "When reading fails": the reader's code not loading (offline, a stale
// deploy) is a failed read too, said plainly, with nothing changed.
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/ink-to-text/read-ink', () => {
  throw new Error('chunk failed');
});

describe('useInkToText when the reader does not load', () => {
  it('changes nothing and says the handwriting could not be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ink = {
      id: 'a',
      type: 'freehand',
      closed: false,
      ...packFreehandPoints([
        { x: 0, y: 0 },
        { x: 40, y: 20 },
      ]),
    } satisfies FreehandElement;
    const commit = vi.fn();
    const toast = { info: vi.fn(), error: vi.fn() };
    const { result } = renderHook(() =>
      useInkToText({
        activeTab: { id: 't', name: 'Tab', elements: [ink] },
        selectionIds: () => new Set(['a']),
        layerLockedIds: new Set(),
        commit,
        readOnly: false,
        createBlocked: false,
        aiEnabled: true,
        ownerId: 'me',
        toast,
        selectOnly: vi.fn(),
      }),
    );
    await act(() => result.current.convertToText());
    expect(commit).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'The handwriting could not be read just now. Try again in a moment.',
    );
    expect(warn.mock.calls[0]![0]).toMatch(/the reader did not load/);
    warn.mockRestore();
  });
});

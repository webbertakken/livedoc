// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages": a jump keeps the place in view before it; Previous view
// goes back to it and Next view forward again, each dimmed with nowhere to go, and logged.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { debugLog } from '@/lib/debug-log';
import type { PdfPlace } from './pdf-page-layout';
import { GO_TO_NEXT_VIEW, GO_TO_PREVIOUS_VIEW } from './pdf-menus';
import { usePdfViewHistory } from './usePdfViewHistory';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

// A view that is wherever it was last sent.
function view(start: PdfPlace | null = { index: 0, across: 0, down: 0 }) {
  let place = start;
  const viewer = {
    placeInView: () => place,
    goToPage: vi.fn((index: number, at = { across: 0, down: 0 }) => {
      place = { index, ...at };
    }),
  };
  const hook = renderHook(() => usePdfViewHistory(viewer));
  return { hook, viewer };
}

describe('Previous view and Next view', () => {
  it('goes back to where a jump left from, and forward again', () => {
    const { hook, viewer } = view();
    expect(hook.result.current.actions[GO_TO_PREVIOUS_VIEW]).toMatchObject({ disabled: true });
    act(() => hook.result.current.jump(4, { across: 0, down: 0.5 }));
    expect(viewer.goToPage).toHaveBeenLastCalledWith(4, { across: 0, down: 0.5 });
    expect(hook.result.current.actions[GO_TO_PREVIOUS_VIEW]).toMatchObject({ disabled: false });
    act(() => hook.result.current.actions[GO_TO_PREVIOUS_VIEW]!.run());
    expect(viewer.goToPage).toHaveBeenLastCalledWith(0, { index: 0, across: 0, down: 0 });
    expect(debugLog).toHaveBeenCalledWith('[pdf] view-history way=back page=1');
    expect(hook.result.current.actions[GO_TO_NEXT_VIEW]).toMatchObject({ disabled: false });
    act(() => hook.result.current.actions[GO_TO_NEXT_VIEW]!.run());
    expect(viewer.goToPage).toHaveBeenLastCalledWith(4, { index: 4, across: 0, down: 0.5 });
    expect(debugLog).toHaveBeenCalledWith('[pdf] view-history way=forward page=5');
  });

  it('steps by its keys, and answers whether it went anywhere', () => {
    const { hook } = view();
    let went = true;
    act(() => {
      went = hook.result.current.step('back');
    });
    expect(went).toBe(false);
    act(() => hook.result.current.jump(2));
    act(() => {
      went = hook.result.current.step('back');
    });
    expect(went).toBe(true);
  });

  it('keeps nothing and goes nowhere before a page is laid out', () => {
    const { hook, viewer } = view(null);
    let went = true;
    act(() => {
      went = hook.result.current.step('back');
    });
    expect(went).toBe(false);
    act(() => hook.result.current.jump(2));
    expect(viewer.goToPage).toHaveBeenCalledWith(2);
    expect(hook.result.current.actions[GO_TO_PREVIOUS_VIEW]).toMatchObject({ disabled: true });
    act(() => {
      went = hook.result.current.step('forward');
    });
    expect(went).toBe(false);
  });
});

// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": a line or shape shows as it is dragged, held to the page's box
// on screen; before the page is laid out there is no box to hold it to, and nothing shows.
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePdfPageDraft } from './usePdfPageDraft';

const pointer = (x: number, y: number) =>
  ({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    shiftKey: false,
    preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn() },
  }) as unknown as PointerEvent<HTMLElement>;

describe('a page’s draft', () => {
  it('shows a shape held to the page’s box, and none while the page has no box', () => {
    const shaping = {
      kind: 'line' as const,
      colour: '#d93025',
      opacity: 1,
      width: 2,
      onShape: vi.fn(),
    };
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    const hook = renderHook<ReturnType<typeof usePdfPageDraft>, { box: HTMLElement | null }>(
      (props: { box: HTMLElement | null }) =>
        usePdfPageDraft({ index: 0, ink: null, shaping, pointAt: (at) => at, box: props.box }),
      { initialProps: { box: element } },
    );
    act(() => {
      hook.result.current.down(pointer(10, 10));
      hook.result.current.move(pointer(500, 50));
    });
    expect(hook.result.current.draft).toEqual({
      colour: '#d93025',
      opacity: 1,
      shape: { kind: 'line', line: [10, 10, 100, 50], width: 2 },
    });
    hook.rerender({ box: null });
    act(() => {
      hook.result.current.up(pointer(500, 50), false);
      hook.result.current.down(pointer(10, 10));
      hook.result.current.move(pointer(50, 50));
    });
    expect(hook.result.current.draft).toBeNull();
  });
});

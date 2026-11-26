// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": with a corner tool in hand each press on a page is a corner,
// one within PDF_MARK_REACH_PX of the first reaching it; the shape so far shows on to the pointer; a double press ends it.
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PDF_MARK_REACH_PX } from '@livedoc/pdf-documents';
import type { PolyDraft } from './pdf-poly';
import type { PdfPageShaping } from './usePdfPageShape';
import { usePdfPagePoly } from './usePdfPagePoly';

// Page space is screen space halved, y up from the foot of a 400-point page.
const pointAt = ({ x, y }: { x: number; y: number }) => ({ x: x / 2, y: 400 - y / 2 });

const pointer = (x: number, y: number, button = 0) =>
  ({
    clientX: x,
    clientY: y,
    button,
    preventDefault: vi.fn(),
  }) as unknown as PointerEvent<HTMLElement>;

function page(kind: PdfPageShaping['kind'], draft: PolyDraft | null = null) {
  const press = vi.fn();
  const end = vi.fn();
  const shaping: PdfPageShaping = {
    kind,
    colour: '#d93025',
    opacity: 1,
    width: 2,
    onShape: vi.fn(),
    poly: { draft, press, end },
  };
  const hook = renderHook(() => usePdfPagePoly({ index: 1, shaping, pointAt }));
  return { hook, press, end };
}

describe('a corner tool on a page', () => {
  it('takes no press for a tool made by a drag', () => {
    const { hook } = page('rectangle');
    expect(hook.result.current.active).toBe(false);
    expect(hook.result.current.down(pointer(10, 10))).toBe(false);
    expect(hook.result.current.move(pointer(10, 10))).toBe(false);
    expect(hook.result.current.presses(2)).toBe(false);
  });

  it('hands each press over as a corner in page space, with the reach in page space', () => {
    const { hook, press } = page('polygon');
    const event = pointer(100, 200);
    expect(hook.result.current.down(event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(press).toHaveBeenCalledWith({
      index: 1,
      at: { x: 50, y: 300 },
      reach: PDF_MARK_REACH_PX / 2,
    });
    // Another button takes the press yet adds no corner.
    expect(hook.result.current.down(pointer(100, 200, 2))).toBe(true);
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('shows the shape so far on to the pointer, on its own page only', () => {
    const draft: PolyDraft = { kind: 'polyline', page: 1, corners: [{ x: 0, y: 400 }] };
    const { hook } = page('polyline', draft);
    act(() => void hook.result.current.move(pointer(80, 0)));
    expect(hook.result.current.draft).toEqual({
      kind: 'polyline',
      corners: [0, 400, 40, 400],
      width: 2,
    });
    const elsewhere = page('polyline', { ...draft, page: 0 });
    act(() => void elsewhere.hook.result.current.move(pointer(80, 0)));
    expect(elsewhere.hook.result.current.draft).toBeNull();
  });

  it('ends the shape on a double press, never on one', () => {
    const { hook, end } = page('cloud');
    expect(hook.result.current.presses(1)).toBe(true);
    expect(end).not.toHaveBeenCalled();
    expect(hook.result.current.presses(2)).toBe(true);
    expect(end).toHaveBeenCalledTimes(1);
  });
});

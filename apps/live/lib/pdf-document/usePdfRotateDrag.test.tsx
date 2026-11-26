// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate, The handle. A drag draws the mark turned as it goes,
// snapped; letting go is one turn; Escape or a cancelled drag puts it back.
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Mark, PageName, type PageMatrix } from '@livedoc/pdf-documents';
import { usePdfRotateDrag } from './usePdfRotateDrag';

const VIEW: PageMatrix = [1, 0, 0, -1, 0, 792];
const stamp = Mark.stamp({
  page: PageName.ofObject(3),
  colour: '#188038',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
  id: 's',
  stamp: 'approved',
  rect: [100, 100, 160, 120],
  lines: ['APPROVED'],
})!;
// The handle at rest, 24 above the top's middle, in view space.
const REST = { x: 130, y: 792 - 144 };

/** A pointer event at a point of view space: the window and the view are one here. */
const at = (x: number, y: number, pointerId = 1) =>
  ({
    clientX: x,
    clientY: y,
    pointerId,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn() },
  }) as unknown as PointerEvent<HTMLElement>;

function drag() {
  const onPreview = vi.fn();
  const onTurn = vi.fn();
  const hook = renderHook(() =>
    usePdfRotateDrag({
      mark: stamp,
      matrix: VIEW,
      rest: REST,
      toView: (client) => client,
      pageBox: () => [0, 0, 612, 792],
      onPreview,
      onTurn,
    }),
  );
  return { hook, onPreview, onTurn };
}

/** The view point `degrees` past upright about the stamp's middle, 40 out. */
const swung = (degrees: number) => {
  const angle = ((90 + degrees) * Math.PI) / 180;
  return [130 + 40 * Math.cos(angle), 792 - (110 + 40 * Math.sin(angle))] as const;
};

describe('usePdfRotateDrag', () => {
  it('draws the mark turned as it goes, snapped, and turns it once let go', () => {
    const { hook, onPreview, onTurn } = drag();
    act(() => hook.result.current.onPointerDown(at(130, REST.y)));
    act(() => hook.result.current.onPointerMove(at(...swung(37))));
    expect(onPreview).toHaveBeenLastCalledWith({ rect: [100, 100, 160, 120], turn: 30 });
    expect(hook.result.current.shown).toMatchObject({ turn: 30 });
    act(() => hook.result.current.onPointerMove(at(...swung(-50))));
    expect(onPreview).toHaveBeenLastCalledWith({ rect: [100, 100, 160, 120], turn: 315 });
    act(() => hook.result.current.onPointerUp(at(...swung(-50))));
    expect(onTurn).toHaveBeenCalledWith(315);
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(hook.result.current.shown).toBe(stamp);
  });

  it('turns nothing let go where it began, and moves nothing for another pointer', () => {
    const { hook, onTurn, onPreview } = drag();
    act(() => hook.result.current.onPointerDown(at(130, REST.y)));
    act(() => hook.result.current.onPointerMove(at(...swung(37), 2)));
    expect(onPreview).not.toHaveBeenCalled();
    act(() => hook.result.current.onPointerMove(at(...swung(5))));
    act(() => hook.result.current.onPointerUp(at(...swung(5))));
    expect(onTurn).not.toHaveBeenCalled();
  });

  it('puts the mark back on Escape, or when the drag is cancelled', () => {
    const { hook, onTurn, onPreview } = drag();
    act(() => hook.result.current.onPointerDown(at(130, REST.y)));
    act(() => hook.result.current.onPointerMove(at(...swung(90))));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onPreview).toHaveBeenLastCalledWith(null);
    act(() => hook.result.current.onPointerUp(at(...swung(90))));
    expect(onTurn).not.toHaveBeenCalled();
    act(() => hook.result.current.onPointerDown(at(130, REST.y)));
    act(() => hook.result.current.onPointerMove(at(...swung(90))));
    act(() => hook.result.current.onPointerCancel(at(...swung(90))));
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(onTurn).not.toHaveBeenCalled();
  });
});

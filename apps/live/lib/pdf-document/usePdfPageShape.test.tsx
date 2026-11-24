// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": a line or shape is dragged from the press to the let-go,
// shown as it is dragged, held to the page, square with ⇧; one pointer drags, a second or a cancel lets it go.
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePdfPageShape, type PdfPageShaping } from './usePdfPageShape';

// The page on screen: 0 to 400 across and down; page space the same, y up from the foot.
const box = { left: 0, top: 0, right: 400, bottom: 400 };
const pointAt = ({ x, y }: { x: number; y: number }) => ({ x, y: 400 - y });

const pointer = (x: number, y: number, over: Record<string, unknown> = {}) =>
  ({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    shiftKey: false,
    preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn() },
    ...over,
  }) as unknown as PointerEvent<HTMLElement>;

function page(kind: PdfPageShaping['kind'] | null = 'rectangle', laidOut = true) {
  const onShape = vi.fn();
  const shaping = kind ? { kind, colour: '#d93025', opacity: 1, width: 2, onShape } : null;
  const hook = renderHook(() =>
    usePdfPageShape({ index: 2, shaping, pointAt, screenBox: () => (laidOut ? box : null) }),
  );
  const run = (step: (shape: ReturnType<typeof usePdfPageShape>) => boolean) => {
    let taken = false;
    act(() => {
      taken = step(hook.result.current);
    });
    return taken;
  };
  return { hook, run, onShape };
}

describe('a shape dragged on a page', () => {
  it('shows the shape as it is dragged and hands it over once let go', () => {
    const { hook, run, onShape } = page('rectangle');
    expect(hook.result.current.active).toBe(true);
    expect(run((shape) => shape.down(pointer(100, 100)))).toBe(true);
    run((shape) => shape.move(pointer(200, 150)));
    expect(hook.result.current.draft).toEqual({
      kind: 'rectangle',
      rect: [100, 250, 200, 300],
      width: 2,
    });
    expect(run((shape) => shape.up(pointer(200, 150), true))).toBe(true);
    expect(onShape).toHaveBeenCalledWith(2, {
      kind: 'rectangle',
      rect: [100, 250, 200, 300],
      width: 2,
    });
    expect(hook.result.current.draft).toBeNull();
  });

  it('keeps it square with ⇧ and on the page past its edge', () => {
    const { hook, run } = page('ellipse');
    run((shape) => shape.down(pointer(100, 100)));
    run((shape) => shape.move(pointer(160, 120, { shiftKey: true })));
    expect(hook.result.current.draft).toEqual({
      kind: 'ellipse',
      rect: [100, 240, 160, 300],
      width: 2,
    });
    run((shape) => shape.move(pointer(900, 120)));
    expect(hook.result.current.draft).toMatchObject({ rect: [100, 280, 400, 300] });
  });

  it('hands over nothing for a press, and nothing at all when cancelled', () => {
    const { run, onShape } = page('line');
    run((shape) => shape.down(pointer(100, 100)));
    run((shape) => shape.up(pointer(100, 100), true));
    expect(onShape).toHaveBeenCalledWith(2, null);
    run((shape) => shape.down(pointer(100, 100)));
    run((shape) => shape.move(pointer(300, 300)));
    run((shape) => shape.up(pointer(300, 300), false));
    expect(onShape).toHaveBeenCalledOnce();
  });

  it('lets the drag go at a second pointer, and minds only the pointer that pressed', () => {
    const { hook, run, onShape } = page('arrow');
    run((shape) => shape.down(pointer(100, 100)));
    run((shape) => shape.move(pointer(300, 300, { pointerId: 2 })));
    expect(hook.result.current.draft).toBeNull();
    expect(run((shape) => shape.up(pointer(300, 300, { pointerId: 2 }), true))).toBe(true);
    run((shape) => shape.move(pointer(300, 300)));
    expect(hook.result.current.draft).toMatchObject({ kind: 'arrow' });
    expect(run((shape) => shape.down(pointer(50, 50, { pointerId: 2 })))).toBe(true);
    expect(hook.result.current.draft).toBeNull();
    run((shape) => shape.up(pointer(300, 300), true));
    expect(onShape).not.toHaveBeenCalled();
  });

  it('begins nothing at a press other than the main button’s, or off the drawn page', () => {
    const { hook, run, onShape } = page('line');
    expect(run((shape) => shape.down(pointer(100, 100, { button: 2 })))).toBe(true);
    run((shape) => shape.move(pointer(300, 300)));
    expect(hook.result.current.draft).toBeNull();
    run((shape) => shape.up(pointer(300, 300), true));
    expect(onShape).not.toHaveBeenCalled();
  });

  it('shows nothing while the page is not laid out', () => {
    const { hook, run } = page('line', false);
    run((shape) => shape.down(pointer(100, 100)));
    expect(run((shape) => shape.move(pointer(300, 300)))).toBe(true);
    expect(hook.result.current.draft).toBeNull();
  });

  it('shows nothing where the page cannot place the pointer, as when its picture is gone', () => {
    let drawn = true;
    const shaping = {
      kind: 'line' as const,
      colour: '#d93025',
      opacity: 1,
      width: 2,
      onShape: vi.fn(),
    };
    const hook = renderHook(() =>
      usePdfPageShape({
        index: 0,
        shaping,
        pointAt: (at) => (drawn ? pointAt(at) : null),
        screenBox: () => box,
      }),
    );
    act(() => {
      hook.result.current.down(pointer(100, 100));
      hook.result.current.move(pointer(300, 300));
    });
    expect(hook.result.current.draft).not.toBeNull();
    drawn = false;
    act(() => {
      hook.result.current.move(pointer(320, 300));
    });
    expect(hook.result.current.draft).toBeNull();
  });

  it('makes nothing when the tool is put down during the drag', () => {
    const onShape = vi.fn();
    const shaping = { kind: 'line' as const, colour: '#d93025', opacity: 1, width: 2, onShape };
    const hook = renderHook<ReturnType<typeof usePdfPageShape>, { shaping: PdfPageShaping | null }>(
      (props: { shaping: PdfPageShaping | null }) =>
        usePdfPageShape({ index: 0, shaping: props.shaping, pointAt, screenBox: () => box }),
      { initialProps: { shaping } },
    );
    act(() => {
      hook.result.current.down(pointer(100, 100));
      hook.result.current.move(pointer(300, 300));
    });
    hook.rerender({ shaping: null });
    act(() => {
      hook.result.current.up(pointer(300, 300), true);
    });
    expect(onShape).not.toHaveBeenCalled();
  });

  it('takes no pointer while another tool is in hand', () => {
    const { hook, run } = page(null);
    expect(hook.result.current.active).toBe(false);
    expect(run((shape) => shape.down(pointer(100, 100)))).toBe(false);
    expect(run((shape) => shape.move(pointer(100, 100)))).toBe(false);
    expect(run((shape) => shape.up(pointer(100, 100), true))).toBe(false);
  });
});

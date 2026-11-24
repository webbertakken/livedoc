// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": a drag across a page's text with a text tool in hand shows the
// text under it as it goes, the latest place always following, and hands the text it covered over once let go.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PagePoint, Quad, TextSelection } from '@livedoc/pdf-documents';
import { usePdfPageTextMark } from './usePdfPageTextMark';

const quadAt = (x: number): Quad => [x, 10, x + 5, 10, x, 0, x + 5, 0];

/** An engine whose answers arrive when the test says. */
function slowEngine() {
  const asked: { to: PagePoint; answer: (selection: TextSelection | null) => void }[] = [];
  const selectText = vi.fn(
    (_index: number, _from: PagePoint, to: PagePoint) =>
      new Promise<TextSelection | null>((answer) => asked.push({ to, answer })),
  );
  return { engine: { selectText }, asked };
}

const settle = () => act(async () => {});

describe('usePdfPageTextMark', () => {
  it('asks one place at a time, the latest following, and shows each answer', async () => {
    const { engine, asked } = slowEngine();
    const onMark = vi.fn();
    const hook = renderHook(() => usePdfPageTextMark({ index: 2, engine, onMark }));
    // No drag: nothing is asked.
    act(() => hook.result.current.move({ x: 1, y: 1 }));
    expect(engine.selectText).not.toHaveBeenCalled();
    act(() => hook.result.current.begin({ x: 0, y: 0 }));
    expect(hook.result.current.dragging()).toBe(true);
    act(() => hook.result.current.move({ x: 10, y: 0 }));
    act(() => hook.result.current.move({ x: 20, y: 0 }));
    act(() => hook.result.current.move({ x: 30, y: 0 }));
    expect(asked).toHaveLength(1);
    asked[0]!.answer({ text: 'a', quads: [quadAt(10)] });
    await settle();
    expect(hook.result.current.preview).toEqual([quadAt(10)]);
    // The latest place, never the one between.
    expect(asked.map((ask) => ask.to.x)).toEqual([10, 30]);
    asked[1]!.answer(null);
    await settle();
    expect(hook.result.current.preview).toEqual([]);
  });

  it('marks the text the drag covered once let go, and lets a late answer go', async () => {
    const { engine, asked } = slowEngine();
    const onMark = vi.fn();
    const hook = renderHook(() => usePdfPageTextMark({ index: 2, engine, onMark }));
    act(() => hook.result.current.begin({ x: 0, y: 0 }));
    act(() => hook.result.current.move({ x: 10, y: 0 }));
    act(() => hook.result.current.end({ x: 40, y: 0 }));
    expect(hook.result.current.dragging()).toBe(false);
    // The answer to the drag's last move arrives after it ended: shown nowhere.
    asked[0]!.answer({ text: 'late', quads: [quadAt(10)] });
    const selection = { text: 'Lease', quads: [quadAt(0)] };
    asked[1]!.answer(selection);
    await settle();
    expect(hook.result.current.preview).toEqual([]);
    expect(onMark).toHaveBeenCalledExactlyOnceWith(2, selection);
  });

  it('marks nothing for a drag let go unmade, for no drag, or over no text', async () => {
    const { engine, asked } = slowEngine();
    const onMark = vi.fn();
    const hook = renderHook(() => usePdfPageTextMark({ index: 0, engine, onMark }));
    act(() => hook.result.current.end({ x: 1, y: 1 }));
    act(() => hook.result.current.begin({ x: 0, y: 0 }));
    act(() => hook.result.current.end(null));
    act(() => hook.result.current.begin({ x: 0, y: 0 }));
    act(() => hook.result.current.end({ x: 9, y: 9 }));
    asked[0]!.answer(null);
    await settle();
    expect(onMark).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Changing a mark": a mouse's or a pen's drag from empty space (no mark, no line
// of text within a line height) draws a box, and once let go selects every mark of the page it touches, ⇧ adding them;
// a drag from text is the text's; a box shorter than PDF_DRAG_SLOP_PX is a press.
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Mark, PageName, PageText, PDF_DRAG_SLOP_PX } from '@livedoc/pdf-documents';
import type { PdfPageTexts } from './pdf-page-texts';
import type { PdfPageChoosing } from './usePdfMarkSelection';
import { usePdfPageBoxing } from './usePdfPageBoxing';

const BASE = {
  page: PageName.ofObject(4),
  colour: '#ff0000',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
};
const left = Mark.shape('rectangle', { ...BASE, id: 'l', rect: [20, 20, 60, 60], width: 2 })!;
const right = Mark.shape('rectangle', { ...BASE, id: 'r', rect: [300, 20, 340, 60], width: 2 })!;
// One line of text, 8 points high, from x 100 to 160 at y 700.
const LINE = 'Hello world';
const TEXT = PageText.of(
  [...LINE].map((c) => c.codePointAt(0)!),
  [...LINE].flatMap((_, at) => [100 + at * 6, 700, 106 + at * 6, 708]),
);

// On screen one CSS pixel a point; y up from the page's foot at 800.
const pointAt = ({ x, y }: { x: number; y: number }) => ({ x, y: 800 - y });
const pointer = (x: number, y: number, over: Record<string, unknown> = {}) =>
  ({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    shiftKey: false,
    ...over,
  }) as unknown as PointerEvent<HTMLElement>;

function boxing({ choose = true, text = TEXT }: { choose?: boolean; text?: PageText | null } = {}) {
  const choosing = { chooseAll: vi.fn() } as unknown as PdfPageChoosing;
  const focusMark = vi.fn();
  const texts: PdfPageTexts = { read: vi.fn(async () => text), tags: vi.fn() };
  const hook = renderHook(() =>
    usePdfPageBoxing({
      index: 2,
      texts,
      marks: [left, right],
      choosing: choose ? choosing : null,
      pointAt,
      focusMark,
    }),
  );
  /** A press at a screen point, its text read. */
  const press = async (x: number, y: number, over: Record<string, unknown> = {}) => {
    hook.result.current.down(pointer(x, y, over), pointAt({ x, y }));
    await act(async () => {});
  };
  return { hook, choosing, press, focusMark };
}

describe('a box drawn from empty space', () => {
  it('draws from the margin and selects the marks it touches once let go', async () => {
    const { hook, choosing, press, focusMark } = boxing();
    await press(10, 790);
    expect(hook.result.current.move(pointer(10 + PDF_DRAG_SLOP_PX - 1, 790))).toBe(true);
    expect(hook.result.current.box).toBeNull();
    act(() => void hook.result.current.move(pointer(200, 750)));
    expect(hook.result.current.box).toEqual([10, 10, 200, 50]);
    let taken = false;
    act(() => void (taken = hook.result.current.up(pointer(200, 750))));
    expect(taken).toBe(true);
    expect(choosing.chooseAll).toHaveBeenCalledWith(2, ['l'], false);
    await act(async () => {});
    expect(focusMark).toHaveBeenCalledWith('l');
    expect(hook.result.current.box).toBeNull();
  });

  it('adds with ⇧, and selects none for a box that touches none', async () => {
    const { hook, choosing, press } = boxing();
    await press(400, 790, { shiftKey: true });
    act(() => void hook.result.current.move(pointer(250, 700)));
    act(() => void hook.result.current.up(pointer(250, 700)));
    expect(choosing.chooseAll).toHaveBeenLastCalledWith(2, ['r'], true);
    await press(400, 400);
    act(() => void hook.result.current.move(pointer(450, 300)));
    act(() => void hook.result.current.up(pointer(450, 300)));
    expect(choosing.chooseAll).toHaveBeenLastCalledWith(2, [], false);
  });

  it('leaves a drag from text, or within a line height of it, to the text', async () => {
    const { hook, choosing, press } = boxing();
    await press(110, 96);
    expect(hook.result.current.move(pointer(200, 300))).toBe(false);
    expect(hook.result.current.up(pointer(200, 300))).toBe(false);
    await press(170, 96);
    expect(hook.result.current.move(pointer(300, 300))).toBe(false);
    expect(choosing.chooseAll).not.toHaveBeenCalled();
  });

  it('draws on a page with no text anywhere', async () => {
    const { hook, press } = boxing({ text: null });
    await press(110, 96);
    expect(hook.result.current.move(pointer(200, 300))).toBe(true);
  });

  it('is a press for one let go short of the slop, and is dropped on a cancel', async () => {
    const { hook, choosing, press } = boxing();
    await press(10, 790);
    expect(hook.result.current.up(pointer(11, 790))).toBe(false);
    await press(10, 790);
    act(() => void hook.result.current.move(pointer(200, 750)));
    act(() => hook.result.current.cancel());
    expect(hook.result.current.box).toBeNull();
    expect(hook.result.current.up(pointer(200, 750))).toBe(false);
    expect(choosing.chooseAll).not.toHaveBeenCalled();
  });

  it('is none for a finger, another button, or while marks may not be changed', async () => {
    for (const [over, choose] of [
      [{ pointerType: 'touch' }, true],
      [{ button: 2 }, true],
      [{}, false],
    ] as const) {
      const { hook, press } = boxing({ choose });
      await press(10, 790, over);
      expect(hook.result.current.move(pointer(200, 750))).toBe(false);
    }
  });
});

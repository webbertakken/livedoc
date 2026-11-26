// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Changing a mark": a press selects the mark it reaches, ⇧ adds; a drag from a
// selected mark moves the selection, shown as it goes, held on the page, one move once let go; a pointer moved less
// than PDF_DRAG_SLOP_PX is a press; a press on a text mark selects it once let go, a drag from it selects text; arrow
// keys move the selection the way they point on screen, whatever the turn.
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Mark,
  PageName,
  PDF_DRAG_SLOP_PX,
  PDF_MARK_REACH_PX,
  PDF_MARK_TOUCH_REACH_PX,
  type PageMatrix,
  type Quad,
} from '@livedoc/pdf-documents';
import type { PdfPageChoosing } from './usePdfMarkSelection';
import { usePdfPageMarkPress } from './usePdfPageMarkPress';

const page = PageName.ofObject(4);
const BASE = { page, colour: '#ff0000', opacity: 1, author: 'Ada', createdAt: 1 };
// A line of text across 100 to 200, its foot at y 300.
const QUAD: Quad = [100, 316, 200, 316, 100, 300, 200, 300];
const arrow = Mark.line('arrow', { ...BASE, id: 'a', line: [10, 10, 50, 10], width: 2 })!;
const box = Mark.shape('rectangle', { ...BASE, id: 'r', rect: [300, 300, 380, 380], width: 2 })!;
const highlight = Mark.highlight({ ...BASE, id: 'h', quads: [QUAD], text: 'x' })!;
const MARKS = [arrow, box, highlight];

// On screen one CSS pixel a point; the page 400 across and down, y up from its foot.
const pointAt = ({ x, y }: { x: number; y: number }) => ({ x, y: 400 - y });
// The page drawn upright: page space to view space flips y.
const UPRIGHT: PageMatrix = [1, 0, 0, -1, 0, 400];
// Turned a quarter clockwise: page x runs down the screen, page y runs left to right.
const TURNED: PageMatrix = [0, 1, 1, 0, 0, 0];

const pointer = (x: number, y: number, over: Record<string, unknown> = {}) =>
  ({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn() },
    ...over,
  }) as unknown as PointerEvent<HTMLElement>;

function pressing({
  chosen = [] as string[],
  choose = true,
  matrix = UPRIGHT,
  drawn = true,
}: { chosen?: string[]; choose?: boolean; matrix?: PageMatrix | null; drawn?: boolean } = {}) {
  const choosing: PdfPageChoosing = {
    mayChange: () => true,
    chooseAll: vi.fn(),
    choose: vi.fn(),
    letGo: vi.fn(),
    leave: vi.fn(),
    move: vi.fn(),
    reshape: vi.fn(),
    remove: vi.fn(),
  };
  const onTextPress = vi.fn();
  const focusMark = vi.fn();
  const hook = renderHook(
    ({ ids }: { ids: readonly string[] }) =>
      usePdfPageMarkPress({
        index: 2,
        marks: MARKS,
        chosen: ids,
        choosing: choose ? choosing : null,
        cssPerPoint: 1,
        pointAt: (client) => (drawn ? pointAt(client) : null),
        matrix: () => matrix,
        pageBox: () => (drawn ? [0, 0, 400, 400] : null),
        onTextPress,
        focusMark,
      }),
    { initialProps: { ids: chosen } },
  );
  const run = (step: (press: ReturnType<typeof usePdfPageMarkPress>) => boolean) => {
    let taken = false;
    act(() => {
      taken = step(hook.result.current);
    });
    return taken;
  };
  return { hook, run, choosing, onTextPress, focusMark };
}

describe('a press on a page’s marks', () => {
  it('selects the mark it reaches, within the reach of its line', () => {
    const { run, choosing, focusMark } = pressing();
    expect(run((press) => press.down(pointer(30, 390 - PDF_MARK_REACH_PX)))).toBe(true);
    expect(choosing.choose).toHaveBeenCalledWith(2, 'a', false);
    expect(run((press) => press.up(pointer(30, 390 - PDF_MARK_REACH_PX)))).toBe(true);
    expect(focusMark).toHaveBeenCalledWith('a');
    expect(choosing.move).not.toHaveBeenCalled();
  });

  it('keeps the marks for a press on nothing with ⇧, for a box to add to them', () => {
    const { run, choosing } = pressing({ chosen: ['a'] });
    expect(run((press) => press.down(pointer(340, 60, { shiftKey: true })))).toBe(false);
    expect(choosing.letGo).not.toHaveBeenCalled();
  });

  it('selects the mark a finger taps, a finger’s reach from its line, and nothing else', () => {
    const { run, choosing, focusMark } = pressing();
    expect(run((press) => press.tap({ x: 30, y: 10 + PDF_MARK_TOUCH_REACH_PX - 1 }))).toBe(true);
    expect(choosing.choose).toHaveBeenCalledWith(2, 'a', false);
    expect(focusMark).toHaveBeenCalledWith('a');
    expect(run((press) => press.tap({ x: 340, y: 340 }))).toBe(false);
    expect(choosing.letGo).toHaveBeenCalled();
    expect(choosing.choose).toHaveBeenCalledTimes(1);
    const { run: none } = pressing({ choose: false });
    expect(none((press) => press.tap({ x: 30, y: 10 }))).toBe(false);
  });

  it('lets the marks go for a press on nothing, and leaves it to the text', () => {
    const { run, choosing } = pressing({ chosen: ['a'] });
    expect(run((press) => press.down(pointer(340, 60)))).toBe(false);
    expect(choosing.letGo).toHaveBeenCalled();
    expect(run((press) => press.move(pointer(350, 60)))).toBe(false);
    expect(run((press) => press.up(pointer(350, 60)))).toBe(false);
  });

  it('takes no press of a finger, of another button, or while marks may not be changed', () => {
    expect(pressing().run((press) => press.down(pointer(30, 390, { pointerType: 'touch' })))).toBe(
      false,
    );
    expect(pressing().run((press) => press.down(pointer(30, 390, { button: 2 })))).toBe(false);
    expect(pressing({ choose: false }).run((press) => press.down(pointer(30, 390)))).toBe(false);
  });

  it('moves the selection by a drag, held on the page, shown as it goes, one move once let go', () => {
    const { hook, run, choosing } = pressing({ chosen: ['a', 'r'] });
    run((press) => press.down(pointer(340, 100)));
    expect(choosing.choose).toHaveBeenCalledWith(2, 'r', false);
    run((press) => press.move(pointer(340 + PDF_DRAG_SLOP_PX - 1, 100)));
    expect(hook.result.current.moving).toBeNull();
    run((press) => press.move(pointer(400, 80)));
    // The rectangle reaches x 380 and y 380: 20 points more each way and it would leave the page.
    expect(hook.result.current.moving).toEqual({ ids: ['a', 'r'], by: { x: 20, y: 20 } });
    run((press) => press.up(pointer(400, 80)));
    expect(choosing.move).toHaveBeenCalledWith(2, { x: 20, y: 20 });
    expect(hook.result.current.moving).toBeNull();
  });

  it('moves the mark pressed alone where it was not selected, and nothing once ⇧ takes it out', () => {
    const one = pressing({ chosen: ['r'] });
    one.run((press) => press.down(pointer(30, 390)));
    one.run((press) => press.move(pointer(40, 390)));
    expect(one.hook.result.current.moving).toEqual({ ids: ['a'], by: { x: 10, y: 0 } });
    const added = pressing({ chosen: ['r'] });
    added.run((press) => press.down(pointer(30, 390, { shiftKey: true })));
    added.run((press) => press.move(pointer(40, 390)));
    expect(added.hook.result.current.moving).toEqual({ ids: ['r', 'a'], by: { x: 10, y: 0 } });
    const out = pressing({ chosen: ['a', 'r'] });
    out.run((press) => press.down(pointer(30, 390, { shiftKey: true })));
    expect(out.choosing.choose).toHaveBeenCalledWith(2, 'a', true);
    out.run((press) => press.move(pointer(40, 390)));
    out.run((press) => press.up(pointer(40, 390)));
    expect(out.hook.result.current.moving).toBeNull();
    expect(out.choosing.move).not.toHaveBeenCalled();
    expect(out.focusMark).not.toHaveBeenCalled();
  });

  it('selects a text mark once let go where pressed, and hands a drag from it to the text', () => {
    const { run, choosing, focusMark } = pressing();
    run((press) => press.down(pointer(150, 92)));
    expect(choosing.choose).not.toHaveBeenCalled();
    run((press) => press.up(pointer(150, 92)));
    expect(choosing.choose).toHaveBeenCalledWith(2, 'h', false);
    expect(focusMark).toHaveBeenCalledWith('h');
    const dragged = pressing();
    dragged.run((press) => press.down(pointer(150, 92, { altKey: true })));
    expect(dragged.run((press) => press.move(pointer(170, 92)))).toBe(false);
    expect(dragged.onTextPress).toHaveBeenCalledWith({ x: 150, y: 308 }, false, true);
    expect(dragged.run((press) => press.up(pointer(170, 92)))).toBe(false);
    expect(dragged.choosing.choose).not.toHaveBeenCalled();
  });

  // The pointer says what a press would do: move a mark, or select a text mark.
  it('names what the pointer is over, for its cursor', () => {
    const { hook, run } = pressing();
    expect(run((press) => press.move(pointer(30, 390, { pointerId: 7 })))).toBe(false);
    expect(hook.result.current.over).toBe('movable');
    run((press) => press.move(pointer(150, 92)));
    expect(hook.result.current.over).toBe('text');
    run((press) => press.move(pointer(340, 60)));
    expect(hook.result.current.over).toBeNull();
    expect(pressing({ choose: false }).hook.result.current.over).toBeNull();
  });

  it('leaves another pointer to its own while one presses', () => {
    const { run, choosing } = pressing({ chosen: ['a'] });
    run((press) => press.down(pointer(30, 390)));
    expect(run((press) => press.move(pointer(60, 390, { pointerId: 2 })))).toBe(false);
    expect(run((press) => press.up(pointer(60, 390, { pointerId: 2 })))).toBe(false);
    expect(choosing.move).not.toHaveBeenCalled();
  });

  it('lets a cancelled drag go, moving nothing', () => {
    const { hook, run, choosing } = pressing({ chosen: ['a'] });
    run((press) => press.down(pointer(30, 390)));
    run((press) => press.move(pointer(60, 390)));
    expect(run((press) => press.cancel())).toBe(true);
    expect(hook.result.current.moving).toBeNull();
    expect(choosing.move).not.toHaveBeenCalled();
    expect(run((press) => press.cancel())).toBe(false);
  });
});

describe('an arrow key on a selected mark', () => {
  it('moves the selection the way the arrow points on screen, held on the page', () => {
    const { run, choosing } = pressing({ chosen: ['a'] });
    run((press) => press.nudge({ x: 0, y: -10 }));
    expect(choosing.move).toHaveBeenCalledWith(2, { x: 0, y: 10 });
    run((press) => press.nudge({ x: -20, y: 0 }));
    // The arrow's left end is 10 points from the page's edge.
    expect(choosing.move).toHaveBeenLastCalledWith(2, { x: -10, y: 0 });
  });

  it('follows the page’s turn', () => {
    const { run, choosing } = pressing({ chosen: ['r'], matrix: TURNED });
    run((press) => press.nudge({ x: 1, y: 0 }));
    expect(choosing.move).toHaveBeenCalledWith(2, { x: 0, y: 1 });
  });

  it('moves nothing before the page is drawn, or for a matrix that cannot be turned back', () => {
    const undrawn = pressing({ chosen: ['a'], drawn: false });
    expect(undrawn.run((press) => press.nudge({ x: 1, y: 0 }))).toBe(true);
    expect(undrawn.run((press) => press.down(pointer(30, 390)))).toBe(false);
    expect(undrawn.choosing.letGo).toHaveBeenCalled();
    const flat = pressing({ chosen: ['a'], matrix: [0, 0, 0, 0, 0, 0] });
    flat.run((press) => press.nudge({ x: 1, y: 0 }));
    expect(undrawn.choosing.move).not.toHaveBeenCalled();
    expect(flat.choosing.move).not.toHaveBeenCalled();
    expect(pressing({ matrix: null }).run((press) => press.nudge({ x: 1, y: 0 }))).toBe(false);
  });

  it('moves nothing while marks may not be changed', () => {
    const { run } = pressing({ choose: false });
    expect(run((press) => press.nudge({ x: 1, y: 0 }))).toBe(false);
  });
});

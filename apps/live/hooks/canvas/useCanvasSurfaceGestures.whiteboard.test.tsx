// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PendingDraw } from '@/lib/draw-mode';
import { penSeen, resetPenSeenForTests } from '@/lib/pen-seen';
import { resetPenPresenceForTests } from '@/lib/pen-presence';
import { useCanvasSurfaceGestures } from './useCanvasSurfaceGestures';

// docs/specs/023-draw-mode/draw-mode.md "Touch and pen input".
const PEN: PendingDraw = {
  type: 'freehand',
  variant: 'whiteboard',
  colour: null,
  width: 4,
  recognise: false,
};

function setup(
  whiteboard: boolean,
  pendingDraw: PendingDraw | null = PEN,
  canvasTool: string = 'select',
) {
  const setPan = vi.fn();
  const onEraseStart = vi.fn();
  const beginPendingDrawGesture = vi.fn(() => true);
  const main = document.createElement('main');
  const { result } = renderHook(() =>
    useCanvasSurfaceGestures({
      canvasTool,
      middleMousePan: true,
      pendingDraw,
      whiteboard,
      viewportOffset: { x: 0, y: 0 },
      viewportZoom: 1,
      mainRef: { current: main },
      wrapperRef: { current: null },
      spaceHeldRef: { current: false },
      setPan,
      setMarquee: vi.fn(),
      spotlight: {},
      avatar: {},
      peerAvatars: [],
      isoCamera: {},
      onDeselect: vi.fn(),
      beginPendingDrawGesture,
      onEraseStart,
      onCanvasContextMenu: vi.fn(),
      onCanvasDoubleClick: vi.fn(),
    } as never),
  );
  const pressWith = (pointerType: string, extra: object = {}, target: Element = main) =>
    result.current.onPointerDownCapture({
      button: 0,
      pointerType,
      pointerId: pointerType === 'pen' ? 9 : 1,
      clientX: 10,
      clientY: 10,
      target,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...extra,
    } as unknown as ReactPointerEvent);
  const press = (pointerType: string, target: Element = main) => pressWith(pointerType, {}, target);
  // The tools group's Undo button, inside <main> as CanvasChrome renders it.
  const cluster = document.createElement('div');
  cluster.setAttribute('data-zoom-cluster', '');
  const undo = document.createElement('button');
  cluster.append(undo);
  main.append(cluster);
  // A press that bubbles to <main>'s own pointerdown, as one on a strip's frame does.
  const bubble = (target: Element) =>
    result.current.onPointerDown({
      button: 0,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 10,
      target,
      currentTarget: main,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as ReactPointerEvent);
  return {
    press,
    pressWith,
    bubble,
    setPan,
    beginPendingDrawGesture,
    onEraseStart,
    undo,
    cluster,
    main,
  };
}

afterEach(() => resetPenSeenForTests());

describe('whiteboard pen versus touch', () => {
  it('lets a finger draw until a pen has been seen', () => {
    const s = setup(true);
    s.press('touch');
    expect(s.beginPendingDrawGesture).toHaveBeenCalled();
    expect(s.setPan).not.toHaveBeenCalled();
  });

  it('pans a finger once a pen has been used, and the pen still draws', () => {
    const s = setup(true);
    s.press('pen');
    expect(penSeen()).toBe(true);
    expect(s.beginPendingDrawGesture).toHaveBeenCalledTimes(1);
    s.press('touch');
    expect(s.setPan).toHaveBeenCalledTimes(1);
    expect(s.beginPendingDrawGesture).toHaveBeenCalledTimes(1);
  });

  it('never changes a diagram tab', () => {
    const s = setup(false);
    s.press('pen');
    s.press('touch');
    expect(s.setPan).not.toHaveBeenCalled();
    expect(s.beginPendingDrawGesture).toHaveBeenCalledTimes(2);
  });
});

// A held marker must not ink under the tools group: pressing Undo drew a dot there, and
// the click then undid the dot instead of the stroke (docs/specs/023-draw-mode/draw-mode.md "Pens").
describe('the tools group is chrome, not canvas', () => {
  it('starts no stroke when Undo is pressed with a marker held', () => {
    const s = setup(true);
    s.press('mouse', s.undo);
    expect(s.beginPendingDrawGesture).not.toHaveBeenCalled();
  });

  it('still inks a press on the canvas with the marker held', () => {
    const s = setup(true);
    s.press('mouse');
    expect(s.beginPendingDrawGesture).toHaveBeenCalledTimes(1);
  });

  it('does not pan a finger on the cluster once a pen has been seen', () => {
    const s = setup(true);
    s.press('pen');
    s.press('touch', s.undo);
    expect(s.setPan).not.toHaveBeenCalled();
  });

  it('starts no draw-to-size on a diagram tab either', () => {
    const s = setup(false, { type: 'shape', kind: 'square' });
    s.press('mouse', s.undo);
    expect(s.beginPendingDrawGesture).not.toHaveBeenCalled();
  });

  it('starts no erase sweep under the cluster', () => {
    const s = setup(true, null, 'eraser');
    s.press('mouse', s.undo);
    expect(s.onEraseStart).not.toHaveBeenCalled();
    s.press('mouse');
    expect(s.onEraseStart).toHaveBeenCalledTimes(1);
  });

  it('starts no draw when a press on a strip frame bubbles to the canvas', () => {
    const s = setup(true);
    s.bubble(s.cluster);
    expect(s.beginPendingDrawGesture).not.toHaveBeenCalled();
  });

  it('still draws when a press on the canvas itself bubbles there', () => {
    const s = setup(true);
    s.bubble(s.main);
    expect(s.beginPendingDrawGesture).toHaveBeenCalledTimes(1);
  });

  it('is the element CanvasChrome renders the Undo strip in', () => {
    // The guard is only as good as the marker it reads: the cluster that holds Undo carries it.
    const src = readFileSync(join(__dirname, '../../components/canvas/CanvasChrome.tsx'), 'utf8');
    const cluster = src.indexOf('data-zoom-cluster=""');
    expect(cluster).toBeGreaterThan(-1);
    expect(src.indexOf('<UndoRedoClusterStrip', cluster)).toBeGreaterThan(cluster);
  });
});

// docs/specs/023-draw-mode/draw-mode.md "Touch and pen input": a pen near the screen rejects the palm, on every tab.
describe('a pen near the screen rejects the palm', () => {
  afterEach(() => resetPenPresenceForTests());

  const penHovers = () =>
    act(() => {
      document.body.dispatchEvent(
        Object.assign(new Event('pointerover', { bubbles: true }), {
          pointerType: 'pen',
          pointerId: 9,
        }),
      );
    });

  it('lets a touch neither pan nor draw while the pen hovers', () => {
    const s = setup(true);
    s.press('pen');
    penHovers();

    s.press('touch');

    expect(s.setPan).not.toHaveBeenCalled();
    expect(s.beginPendingDrawGesture).toHaveBeenCalledTimes(1);
  });

  it('lets a touch do nothing on a diagram tab while the pen hovers', () => {
    const s = setup(false, null);
    penHovers();

    const stopPropagation = vi.fn();
    s.pressWith('touch', { stopPropagation });

    expect(stopPropagation).toHaveBeenCalled();
    expect(s.setPan).not.toHaveBeenCalled();
  });

  it('lets the pen itself draw while it is near', () => {
    const s = setup(true);
    penHovers();

    s.press('pen');

    expect(s.beginPendingDrawGesture).toHaveBeenCalledTimes(1);
  });

  it('lets a finger pan again once the pen leaves range', () => {
    const s = setup(true);
    s.press('pen');
    penHovers();
    act(() => {
      document.body.dispatchEvent(
        Object.assign(new Event('pointerout', { bubbles: true }), {
          pointerType: 'pen',
          pointerId: 9,
          relatedTarget: null,
        }),
      );
    });

    s.press('touch');

    expect(s.setPan).toHaveBeenCalledTimes(1);
  });
});

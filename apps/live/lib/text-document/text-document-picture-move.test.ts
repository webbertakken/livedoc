// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Dragging a placed picture", "Guides": the box follows the pointer through
// the zoom, snapping across to its column's edges and centre within 4 screen px; the move is given back once on
// release, nothing on Escape or a cancelled pointer.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { movePlacedPicture, type PictureMove } from './text-document-picture-move';

afterEach(() => document.body.replaceChildren());

// A paragraph 600 px wide (450 pt), drawn at twice its size: a point is 8/3 screen px.
function setup() {
  const paragraph = document.createElement('p');
  Object.defineProperty(paragraph, 'offsetWidth', { value: 600 });
  paragraph.getBoundingClientRect = () => ({ width: 1200 }) as DOMRect;
  const turn = document.createElement('span');
  Object.defineProperty(turn, 'offsetParent', { value: paragraph });
  const preview = vi.fn();
  const done = vi.fn<(moved: PictureMove | null) => void>();
  const down = new PointerEvent('pointerdown', { clientX: 100, clientY: 100 });
  const end = movePlacedPicture(down, {
    turn,
    start: { left: 50, top: 10, width: 100 },
    preview,
    done,
  });
  const to = (clientX: number, clientY: number) =>
    window.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY }));
  return { preview, done, end, to };
}

describe('movePlacedPicture', () => {
  it('follows the pointer through the zoom, and gives the move back on release', () => {
    const { preview, done, to } = setup();
    to(100 + 80, 100 + 160);
    expect(preview).toHaveBeenLastCalledWith(80, 70, null);
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(done).toHaveBeenCalledWith({ dx: 30, dy: 60 });
    to(0, 0);
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('snaps its centre to the column’s within 4 screen px, the guide shown', () => {
    const { preview, done, to } = setup();
    // Its centre at 175 + 1 pt (2.67 px) off the column's centre, 225.
    to(100 + (124 * 8) / 3, 100);
    expect(preview).toHaveBeenLastCalledWith(175, 0 + 10, 225);
    // 2 pt (5.3 px) off: no snap.
    to(100 + (127 * 8) / 3, 100);
    expect(preview).toHaveBeenLastCalledWith(177, 10, null);
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(done.mock.calls[0]![0]!.dx).toBeCloseTo(127);
  });

  it('gives back nothing on Escape, or where it did not move', () => {
    const first = setup();
    first.to(300, 300);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(first.done).toHaveBeenCalledWith(null);
    const second = setup();
    second.end(true);
    expect(second.done).toHaveBeenCalledWith(null);
  });
});

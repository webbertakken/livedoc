// @vitest-environment jsdom
import { useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VIEWPORT_EDGE_MARGIN } from '@/lib/clamp-to-viewport';
import { useKeepInWindow } from './useKeepInWindow';

// The parts of keeping a box inside the window that the boxes drawn with it do not reach: a box drawn in canvas
// units, and the looks no render asks for. jsdom lays nothing out, so where the box stands is this file's to say.

const SIZE = { width: 300, height: 100 };
// Where the box would stand unmoved, window px.
let place = { left: 0, top: 0 };
// How many of the box's own px one screen px is, as the page draws it.
let drawnUnit = 1;
let sized: (() => void) | null = null;

const box = () => document.querySelector<HTMLElement>('[data-box]')!;
const written = (node: HTMLElement) => {
  // A move along one axis is read back as `translate(x)`.
  const found = /translate\(([-+.\de]+)px(?:, ([-+.\de]+)px)?\)/.exec(node.style.transform);
  return found ? { x: Number(found[1]), y: Number(found[2] ?? 0) } : { x: 0, y: 0 };
};

function Box({ unit }: { unit?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useKeepInWindow(ref, unit);
  return <div ref={ref} data-box />;
}

beforeEach(() => {
  place = { left: 0, top: 0 };
  drawnUnit = 1;
  sized = null;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const own = written(this);
    return new DOMRect(
      place.left + own.x / drawnUnit,
      place.top + own.y / drawnUnit,
      SIZE.width,
      SIZE.height,
    );
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(onSize: () => void) {
        sized = onSize;
      }
      observe() {}
      disconnect() {
        sized = null;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const overRight = () => window.innerWidth - VIEWPORT_EDGE_MARGIN - (place.left + SIZE.width);

describe('useKeepInWindow', () => {
  it('writes the move in the box’s own units', () => {
    place = { left: window.innerWidth - 100, top: 200 };
    drawnUnit = 0.5;

    render(<Box unit={0.5} />);

    expect(written(box())).toEqual({ x: overRight() * 0.5, y: 0 });
  });

  it('keeps the box where it is on the page when its unit changes', () => {
    place = { left: window.innerWidth - 100, top: 200 };
    drawnUnit = 0.5;
    const { rerender } = render(<Box unit={0.5} />);

    drawnUnit = 0.25;
    rerender(<Box unit={0.25} />);

    expect(written(box())).toEqual({ x: overRight() * 0.25, y: 0 });
  });

  it('looks again when the window changes size', () => {
    place = { left: window.innerWidth - 100, top: 200 };
    render(<Box />);
    expect(written(box()).x).toBeLessThan(0);

    place = { left: 300, top: 200 };
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(written(box())).toEqual({ x: 0, y: 0 });
  });

  it('looks again when the box changes size, until it is gone', () => {
    place = { left: 300, top: 200 };
    const { unmount } = render(<Box />);
    expect(written(box())).toEqual({ x: 0, y: 0 });

    place = { left: window.innerWidth - 100, top: 200 };
    act(() => sized?.());
    expect(written(box())).toEqual({ x: overRight(), y: 0 });

    unmount();
    expect(sized).toBeNull();
  });

  it('leaves a box that is not laid out alone', () => {
    SIZE.width = 0;
    place = { left: window.innerWidth + 500, top: 200 };

    render(<Box />);

    expect(box().style.transform).toBe('');
    SIZE.width = 300;
  });
});

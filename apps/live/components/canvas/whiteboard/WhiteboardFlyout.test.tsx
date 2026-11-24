// @vitest-environment jsdom

// A flyout off Draw's dock (docs/specs/023-draw-mode/draw-mode.md "Where the dock sits"): on the board side of the
// dock, a gap away. Above a dock at the bottom it keeps its bottom edge there as it grows (a section opening
// inside it), so it never runs under the dock or off the screen.

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhiteboardFlyout } from './WhiteboardFlyout';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

// One ResizeObserver per observed node, whose callback the test fires by hand.
function stubObserver(): { fire: () => void } {
  const callbacks: Array<() => void> = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  return { fire: () => callbacks.forEach((cb) => cb()) };
}

function dockAt(top: number, bottom: number) {
  const dock = document.createElement('div');
  dock.setAttribute('data-whiteboard-dock', '');
  dock.getBoundingClientRect = () => ({ top, bottom, left: 300, right: 800 }) as DOMRect;
  const opener = document.createElement('button');
  opener.setAttribute('data-dock-item', 'pen');
  opener.getBoundingClientRect = () => ({ left: 500, width: 32, top, bottom }) as DOMRect;
  dock.append(opener);
  document.body.append(dock);
}

function setHeight(height: number) {
  const node = screen.getByRole('group', { name: 'Pen' });
  Object.defineProperty(node, 'offsetHeight', { configurable: true, value: height });
  Object.defineProperty(node, 'offsetWidth', { configurable: true, value: 200 });
}

describe('WhiteboardFlyout above a dock at the bottom', () => {
  it('moves up as it grows, its bottom edge kept a gap above the dock', () => {
    const observer = stubObserver();
    dockAt(660, 708);
    render(
      <WhiteboardFlyout id="f" label="Pen" anchor="pen" placement="above" onClose={() => {}}>
        <p>Colours</p>
      </WhiteboardFlyout>,
    );
    setHeight(120);
    act(() => observer.fire());
    const node = screen.getByRole('group', { name: 'Pen' });
    expect(node.style.top).toBe(`${660 - 8 - 120}px`);
    setHeight(300);
    act(() => observer.fire());
    expect(node.style.top).toBe(`${660 - 8 - 300}px`);
  });
});

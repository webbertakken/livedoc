// @vitest-environment jsdom
// SnapWidth rounds a text-sized box to whole pixels, so icons after it (or a
// centred parent) stay on the pixel grid and render sharp.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SnapWidth } from './SnapWidth';

// The resize callbacks made, so a test can report the content resizing as a browser does: before the frame is drawn.
const resized: (() => void)[] = [];
beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(cb: () => void) {
      resized.push(cb);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom has no layout: give the content and the parent the widths a browser
// would measure.
function measureAs(content: number, parent: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = this.classList.contains('w-max')
      ? content
      : this.dataset.parent !== undefined
        ? parent
        : 0;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0 } as DOMRect;
  });
}

function snapped(props: { matchParentParity?: boolean }) {
  const { container } = render(
    <div data-parent="">
      <SnapWidth {...props}>label</SnapWidth>
    </div>,
  );
  return (container.querySelector('[data-parent] > div') as HTMLElement).style.width;
}

describe('SnapWidth', () => {
  it('rounds a fractional content width up to a whole pixel', () => {
    measureAs(61.39, 1440);
    expect(snapped({})).toBe('62px');
  });

  it('leaves a whole-pixel width as it is', () => {
    measureAs(62, 1440);
    expect(snapped({})).toBe('62px');
  });

  it("matches the parent's parity so centring stays on a whole pixel", () => {
    // 1441 - 62 is odd: centred, the box would sit half a pixel in.
    measureAs(61.39, 1441);
    expect(snapped({ matchParentParity: true })).toBe('63px');
    measureAs(61.39, 1440);
    expect(snapped({ matchParentParity: true })).toBe('62px');
  });

  // A resize is reported before the frame is drawn, and the snapped width is written then: held in React state it
  // landed a task later, after that frame, so the palette strip drew a frame at its old width and then moved
  // (a layout shift as a board opens, docs/specs/007-editor/toolbar-layout.md "Motion").
  it('follows its content in the frame the content resizes, with no render', () => {
    measureAs(795, 1440);
    const { container } = render(
      <div data-parent="">
        <SnapWidth>label</SnapWidth>
      </div>,
    );
    const box = container.querySelector('[data-parent] > div') as HTMLElement;
    expect(box.style.width).toBe('795px');
    measureAs(580.6, 1440);
    resized.forEach((cb) => cb());
    expect(box.style.width).toBe('581px');
  });

  // Chrome counts what a resize callback moves as a layout shift, even before the frame is drawn: a box whose
  // content changes in a commit takes its width in that commit, named by `contentKey`.
  it('takes its new width in the commit its contentKey changes, before any resize is reported', () => {
    measureAs(795, 1440);
    const { container, rerender } = render(
      <div data-parent="">
        <SnapWidth contentKey="twelve">label</SnapWidth>
      </div>,
    );
    const box = container.querySelector('[data-parent] > div') as HTMLElement;
    measureAs(580.6, 1440);
    rerender(
      <div data-parent="">
        <SnapWidth contentKey="six">label</SnapWidth>
      </div>,
    );
    expect(box.style.width).toBe('581px');
  });
});

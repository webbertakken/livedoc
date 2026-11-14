// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { beginCanvasGesture } from '@/lib/canvas-gesture';
import { CanvasZoomProvider, CounterScaled, useHitBandZoom } from './CanvasZoomContext';

// docs/specs/008-canvas/canvas-performance.md: a counter-scaled part keeps its size on screen, and it
// alone reads the zoom, so the element around it does not render for a zoom.

describe('CounterScaled', () => {
  it('scales its content by the inverse of the zoom, keeping its own props', () => {
    const { container } = render(
      <CanvasZoomProvider zoom={2}>
        <CounterScaled className="pill" data-x="1">
          hi
        </CounterScaled>
      </CanvasZoomProvider>,
    );
    const div = container.querySelector('div.pill') as HTMLDivElement;
    expect(div.style.transform).toBe('scale(0.5)');
    expect(div.dataset.x).toBe('1');
    expect(div.textContent).toBe('hi');
  });
});

// "A zoom moves no hit band": the invisible bands that catch a whiteboard shape or stroke hold the zoom a zoom
// gesture started at, and take the new one when it ends, so a wheel tick writes nothing to the board's elements.
describe('useHitBandZoom', () => {
  function Band() {
    return <span data-band={useHitBandZoom()} />;
  }
  const band = (c: HTMLElement) =>
    Number(c.querySelector('[data-band]')!.getAttribute('data-band'));

  it('is the zoom while no zoom is under way', () => {
    const { container, rerender } = render(
      <CanvasZoomProvider zoom={1}>
        <Band />
      </CanvasZoomProvider>,
    );
    rerender(
      <CanvasZoomProvider zoom={2}>
        <Band />
      </CanvasZoomProvider>,
    );
    expect(band(container)).toBe(2);
  });

  it('holds the zoom the gesture started at, and takes the new zoom when it ends', () => {
    const { container, rerender } = render(
      <CanvasZoomProvider zoom={1}>
        <Band />
      </CanvasZoomProvider>,
    );
    let end = () => {};
    act(() => {
      end = beginCanvasGesture('zoom');
    });
    for (const zoom of [1.1, 1.2, 1.5])
      rerender(
        <CanvasZoomProvider zoom={zoom}>
          <Band />
        </CanvasZoomProvider>,
      );
    expect(band(container)).toBe(1);
    act(() => end());
    expect(band(container)).toBe(1.5);
  });

  it('is 1 outside a canvas', () => {
    const { container } = render(<Band />);
    expect(band(container)).toBe(1);
  });
});

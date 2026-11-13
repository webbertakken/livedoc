// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RotateZones, rotateCursor } from './RotateZones';

afterEach(cleanup);

// docs/specs/008-canvas/selection-transforms.md "Rotating by hand".
describe('RotateZones', () => {
  it('puts a zone at each corner that starts a turn on a primary press', () => {
    const onBeginDrag = vi.fn();
    const { container } = render(<RotateZones elementId="a" zoom={2} onBeginDrag={onBeginDrag} />);
    const zones = container.querySelectorAll('[data-rotate-zone]');
    expect([...zones].map((z) => z.getAttribute('data-rotate-zone'))).toEqual([
      'nw',
      'ne',
      'sw',
      'se',
    ]);
    fireEvent.pointerDown(zones[3]!, { button: 0 });
    expect(onBeginDrag).toHaveBeenCalledWith('a', 'rotate', expect.anything());
  });

  it('leaves a secondary press to the context menu', () => {
    const onBeginDrag = vi.fn();
    const { container } = render(<RotateZones elementId="a" zoom={1} onBeginDrag={onBeginDrag} />);
    fireEvent.pointerDown(container.querySelector('[data-rotate-zone]')!, { button: 2 });
    expect(onBeginDrag).not.toHaveBeenCalled();
  });

  it('keeps its screen size at every zoom', () => {
    const { container } = render(<RotateZones elementId="a" zoom={4} onBeginDrag={() => {}} />);
    const anchor = container.querySelector('[data-rotate-zone]')!.parentElement!;
    expect(anchor.style.transform).toBe('scale(0.25)');
  });
});

describe('rotateCursor', () => {
  it('turns the arrow to face its corner, with the frame', () => {
    const decoded = (c: string) => decodeURIComponent(c);
    expect(decoded(rotateCursor('ne', 0))).toContain('rotate(0 12 12)');
    expect(decoded(rotateCursor('nw', 0))).toContain('rotate(270 12 12)');
    expect(decoded(rotateCursor('se', 45))).toContain('rotate(135 12 12)');
    expect(decoded(rotateCursor('sw', 270))).toContain('rotate(90 12 12)');
  });

  it('falls back to a grab cursor', () => {
    expect(rotateCursor('ne', 0)).toMatch(/ 12 12, grab$/);
  });
});

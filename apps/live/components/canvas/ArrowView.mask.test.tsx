// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createPinnedArrow, createShape, type Element } from '@livedoc/document';
import { deriveArrowViewFrame } from './arrow-view-frame';
import { ArrowView } from './ArrowView';

// docs/specs/008-canvas/canvas-performance.md "A break stays local": an arrow broken where it runs behind a box is
// masked over its own extent, never a vast region, so a hole that moves repaints only the arrow.

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

function drawn(holes: { x: number; y: number; width: number; height: number }[]) {
  const a = { ...createShape('square', 0, 0), id: 'a', width: 100, height: 60 } as Element;
  const b = { ...createShape('square', 600, 0), id: 'b', width: 100, height: 60 } as Element;
  const arrow = { ...createPinnedArrow('a', 'e', 'b', 'w'), id: 'arr' };
  const index = new Map([a, b, arrow].map((el) => [el.id, el]));
  const noop = () => {};
  render(
    <svg>
      <ArrowView
        arrow={arrow}
        frame={deriveArrowViewFrame(arrow, index)}
        holes={holes}
        labelRender={{ layout: null, knockouts: [] }}
        draftLayout={() => null}
        isSelected={false}
        isPaintMode={false}
        isEditing={false}
        tabLocked={false}
        onSelect={noop}
        onContextSelect={noop}
        onBeginEndpointDrag={noop}
        onBeginEdit={noop}
        onCommitLabel={noop}
      />
    </svg>,
  );
  return document.querySelector('mask');
}

describe('ArrowView behind a box', () => {
  it('masks over the arrow’s own extent, grown for its heads', () => {
    const mask = drawn([{ x: 300, y: -20, width: 80, height: 100 }])!;
    const width = Number(mask.getAttribute('width'));
    const x = Number(mask.getAttribute('x'));
    // The arrow runs from x 100 to 600: the region covers it with a margin, and is nowhere near vast.
    expect(x).toBeLessThan(100);
    expect(x + width).toBeGreaterThan(600);
    expect(width).toBeLessThan(1000);
    const backdrop = mask.querySelector('rect')!;
    expect(backdrop.getAttribute('width')).toBe(mask.getAttribute('width'));
  });

  it('mints no mask when nothing cuts it', () => {
    expect(drawn([])).toBeNull();
  });
});

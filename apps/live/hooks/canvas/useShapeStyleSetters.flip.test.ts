// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createShape, type Element, type Tab } from '@livedoc/document';
import { track } from '@/lib/telemetry';
import { useShapeStyleSetters } from './useShapeStyleSetters';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

// docs/specs/008-canvas/selection-transforms.md "Flipping".
function setup(selected: string[]) {
  const a = { ...createShape('square', 0, 0), id: 'a', width: 20, height: 10 };
  const b = { ...createShape('square', 80, 40), id: 'b', width: 20, height: 10, rotation: 30 };
  let elements: Element[] = [a, b];
  const commits = vi.fn((map: (els: Element[]) => Element[]) => {
    elements = map(elements);
  });
  const tab: Tab = { id: 't', name: 'Tab', elements };
  const setters = renderHook(() =>
    useShapeStyleSetters({
      currentSelectionIds: () => new Set(selected),
      commit: commits,
      activeTab: tab,
      readSelection: () => ({
        selectedId: selected[0] ?? null,
        multiSelectedIds: new Set(selected),
      }),
    }),
  ).result.current;
  return {
    setters,
    commits,
    els: () => elements as (Element & { x: number; y: number; rotation?: number })[],
  };
}

describe('flipSelected', () => {
  it('mirrors the selection left to right in one commit', () => {
    const { setters, commits, els } = setup(['a', 'b']);
    setters.flipSelected('horizontal');
    expect(commits).toHaveBeenCalledTimes(1);
    const [a, b] = els();
    expect(a!.x).toBeGreaterThan(b!.x);
    expect(b!.rotation).toBe(330);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'FlipHorizontal');
  });

  it('mirrors top to bottom for a vertical flip', () => {
    const { setters, els } = setup(['a', 'b']);
    setters.flipSelected('vertical');
    const [a, b] = els();
    expect(a!.y).toBeGreaterThan(b!.y);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'FlipVertical');
  });

  it('does nothing with nothing selected', () => {
    const { setters, commits } = setup([]);
    setters.flipSelected('horizontal');
    expect(commits).not.toHaveBeenCalled();
  });
});

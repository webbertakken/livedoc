// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

// useStylePreview keeps one piece of React state — a `useRef` holding the
// pre-hover snapshot. The hook renders once per harness and its closures share
// that one ref, which is exactly the per-instance behaviour we want.

import { createShape, type Element, type Tab } from '@livedoc/document';
import type { ShapeColorPreset } from '@/lib/themes';
import { useStylePreview } from './useStylePreview';

const PRESET_A: ShapeColorPreset = {
  id: 'a',
  name: 'A',
  fill: '#aa0000',
  stroke: '#aa0000',
  text: '#aa0000',
  borderStroke: 'thick',
  borderStyle: 'solid',
};
const PRESET_B: ShapeColorPreset = {
  id: 'b',
  name: 'B',
  fill: '#00bb00',
  stroke: '#00bb00',
  text: '#00bb00',
  borderStroke: 'thin',
  borderStyle: 'dashed',
};

// Model the production wiring's defining quirk: `tabsRef` is a LIVE MIRROR that
// only re-syncs to React state inside a post-render effect, so a synchronous
// tickTabs does NOT update it — it lags by a render. `tickTabs` here mutates the
// committed tabs (React state); `render()` is that lagging effect copying the
// committed value back into the ref. A fast pointer sweep fires
// pointerleave→pointerenter with NO render in between, which is the window the
// bug lived in.
function harness() {
  const a = createShape('square', 0, 0);
  let committed: Tab[] = [{ id: 'tab1', name: 'Tab', elements: [a] }];
  const tabsRef = { current: committed };
  const preview = renderHook(() =>
    useStylePreview({
      editsBlocked: false,
      activeId: 'tab1',
      currentSelectionIds: () => new Set([a.id]),
      tabsRef: tabsRef,
      tickTabs: (map) => {
        committed = map(committed);
      },
      commitTabs: (map) => {
        committed = map(committed);
      },
      previewingRef: { current: false },
    }),
  ).result.current;
  return {
    preview,
    a,
    el: () => committed[0]!.elements[0] as Element & { fillColor?: string; colorPreset?: string },
    // The lagging effect: copy committed React state into the live mirror.
    render: () => {
      tabsRef.current = committed;
    },
  };
}

function isPristine(el: { fillColor?: string; colorPreset?: string }) {
  return el.fillColor === undefined && el.colorPreset === undefined;
}

describe('useStylePreview hover snapshot integrity', () => {
  it('reverts to the true original after a single hover + leave', () => {
    const h = harness();
    h.preview.previewShapeColorPreset(PRESET_A);
    expect(h.el().fillColor).toBe('#aa0000'); // preview live
    h.preview.clearPreview();
    expect(isPristine(h.el())).toBe(true); // back to default
  });

  it('reverts to the true original after a fast tile-to-tile sweep, NOT to a hovered preset', () => {
    const h = harness();

    // Hover tile A and pause long enough for a render to land the preview in the
    // live mirror (this is what made the next snapshot read stale state).
    h.preview.previewShapeColorPreset(PRESET_A);
    h.render();

    // Sweep A -> B with no render in between (leave A, immediately enter B).
    h.preview.clearPreview();
    h.preview.previewShapeColorPreset(PRESET_B);
    h.render();
    expect(h.el().fillColor).toBe('#00bb00'); // B is previewing now

    // Leave the menu entirely.
    h.preview.clearPreview();
    h.render();

    // The bug left the element stuck on PRESET_A (the snapshot had captured A's
    // preview as the "original"). It must land on the pristine default instead.
    expect(isPristine(h.el())).toBe(true);
  });

  it('a click after a fast sweep commits exactly the clicked preset, uncontaminated', () => {
    const h = harness();

    h.preview.previewShapeColorPreset(PRESET_A);
    h.render();
    h.preview.clearPreview();
    h.preview.previewShapeColorPreset(PRESET_B);
    h.render();

    // Click commits B from the true original base, not B-stacked-on-A.
    h.preview.commitShapeColorPreset(PRESET_B);
    const el = h.el();
    expect(el.fillColor).toBe('#00bb00');
    expect(el.colorPreset).toBe('b');
  });
});

// docs/specs/008-canvas/canvas-and-palette.md "Locking": a rotation leaves a locked element unchanged, whichever
// control turns it.
describe('useStylePreview rotation tiles', () => {
  it('turn the unlocked members of a selection and leave a locked one', () => {
    const free = createShape('square', 0, 0);
    const locked = { ...createShape('square', 200, 0), locked: true };
    let committed: Tab[] = [{ id: 'tab1', name: 'Tab', elements: [free, locked] }];
    const preview = renderHook(() =>
      useStylePreview({
        editsBlocked: false,
        activeId: 'tab1',
        currentSelectionIds: () => new Set([free.id, locked.id]),
        tabsRef: { current: committed },
        tickTabs: (map) => {
          committed = map(committed);
        },
        commitTabs: (map) => {
          committed = map(committed);
        },
        previewingRef: { current: false },
      }),
    ).result.current;
    preview.commitRotation(90);
    const [a, b] = committed[0]!.elements as (Element & { rotation?: number })[];
    expect(a!.rotation).toBe(90);
    expect(b!.rotation).toBeUndefined();
  });

  // docs/specs/008-canvas/selection-transforms.md "Rotation tiles on a multi-selection".
  function pair() {
    const a = { ...createShape('square', 0, 0), width: 20, height: 10 };
    const b = { ...createShape('square', 80, 0), width: 20, height: 10, rotation: 45 };
    let committed: Tab[] = [{ id: 'tab1', name: 'Tab', elements: [a, b] }];
    const tabsRef = { current: committed };
    const preview = renderHook(() =>
      useStylePreview({
        editsBlocked: false,
        activeId: 'tab1',
        currentSelectionIds: () => new Set([a.id, b.id]),
        tabsRef,
        tickTabs: (map) => {
          committed = map(committed);
        },
        commitTabs: (map) => {
          committed = map(committed);
        },
        previewingRef: { current: false },
      }),
    ).result.current;
    type Turned = Element & { x: number; y: number; rotation?: number };
    return { preview, a, b, els: () => committed[0]!.elements as Turned[] };
  }

  it('turns a multi-selection as one piece, the reference member landing on the tile', () => {
    const { preview, els } = pair();
    preview.commitRotation(90);
    const [a, b] = els();
    expect(a!.rotation).toBe(90);
    expect(b!.rotation).toBe(135);
    // Rigid: the centres stay 80 apart and now line up vertically.
    expect(b!.x - a!.x).toBeCloseTo(0);
    expect(Math.abs(b!.y - a!.y)).toBeCloseTo(80);
  });

  it('previews the same turn and puts the selection back on leave', () => {
    const { preview, a, b, els } = pair();
    preview.previewRotation(180);
    expect(els()[1]!.rotation).toBe(225);
    expect(els()[1]!.x).toBeLessThan(els()[0]!.x);
    preview.clearPreview();
    expect(els()).toEqual([a, b]);
  });
});

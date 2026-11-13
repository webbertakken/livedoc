// Pin the element-menu placement rules (docs/specs/008-canvas/canvas-and-palette.md): beside the element on
// the right, flipping left when the right lacks room, and clamped into
// the viewport when neither side fully fits (a wide element in a narrow
// window) so the menu stays reachable. The regression this guards: an
// off-screen left-side fallback that made the menu unreachable, and the
// entry-animation mis-measure that anchored it over the element.
//
// `elementMenuAnchor` reads window.innerWidth; Vitest's Node env has no
// real window, so the tests stub the property (same pattern as
// clamp-to-viewport.test.ts).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  editMenuAnchor,
  elementMenuAnchor,
  pointerMenuAnchor,
  rightClickMenuAnchor,
} from './context-menu-anchor';

const MENU_WIDTH = 224;
const GAP = 8;
const VW = 1200;

const originalWindow = globalThis.window;

beforeEach(() => {
  (globalThis as unknown as { window: { innerWidth: number } }).window = { innerWidth: VW };
});

afterEach(() => {
  if (originalWindow) {
    (globalThis as unknown as { window: Window }).window = originalWindow;
  } else {
    delete (globalThis as unknown as Record<string, unknown>).window;
  }
});

describe('elementMenuAnchor', () => {
  it('opens beside the element top-right when the menu fits on the right', () => {
    const out = elementMenuAnchor({ left: 100, right: 300, top: 50 });
    expect(out).toEqual({ x: 300 + GAP, y: 50 });
  });

  it('flips to the left side when the right lacks room', () => {
    const right = VW - 100; // less than MENU_WIDTH + GAP of space remains
    const out = elementMenuAnchor({ left: 600, right, top: 50 });
    expect(out).toEqual({ x: 600 - MENU_WIDTH - GAP, y: 50 });
  });

  it('clamps into the viewport when neither side fits', () => {
    // Element spans nearly the whole (narrow) window: the left-side
    // fallback would land off-screen at a negative x.
    const out = elementMenuAnchor({ left: 40, right: VW - 40, top: 50 });
    expect(out.x).toBe(GAP);
    expect(out.y).toBe(50);
  });

  it('never places the menu past the right viewport edge', () => {
    const out = elementMenuAnchor({ left: 100, right: 300, top: 50 });
    expect(out.x + MENU_WIDTH + GAP).toBeLessThanOrEqual(VW);
  });
});

// docs/specs/008-canvas/canvas-and-palette.md "Rich text labels": the menu beside a label being edited clears the
// floating text toolbar, which is wider than a small element.
describe('editMenuAnchor', () => {
  it('opens beside the toolbar when it reaches past the element, at the element top', () => {
    const element = { left: 500, right: 600, top: 300 };
    expect(editMenuAnchor(element, { left: 400, right: 700 })).toEqual({ x: 708, y: 300 });
    expect(editMenuAnchor(element, null)).toEqual(elementMenuAnchor(element));
    // A toolbar narrower than the element changes nothing.
    expect(editMenuAnchor(element, { left: 520, right: 580 })).toEqual(elementMenuAnchor(element));
  });
});

// docs/specs/008-canvas/canvas-and-palette.md "Element menu anchor": a pointer right-click opens the menu at the pointer,
// a couple of pixels off its tip, and on the pointer's left when the right lacks room.
describe('pointerMenuAnchor', () => {
  const POINTER_GAP = 2;

  it('opens just off the pointer tip, down and to the right', () => {
    expect(pointerMenuAnchor({ x: 400, y: 120 })).toEqual({
      x: 400 + POINTER_GAP,
      y: 120 + POINTER_GAP,
    });
  });

  it("opens on the pointer's left when the menu would not fit to its right", () => {
    const x = VW - 100;
    expect(pointerMenuAnchor({ x, y: 120 })).toEqual({
      x: x - MENU_WIDTH - POINTER_GAP,
      y: 120 + POINTER_GAP,
    });
  });

  it('stays inside the viewport when neither side fits', () => {
    (globalThis as unknown as { window: { innerWidth: number } }).window = { innerWidth: 300 };
    expect(pointerMenuAnchor({ x: 150, y: 10 }).x).toBe(GAP);
  });
});

// docs/specs/008-canvas/canvas-and-palette.md "Element menu anchor": a pointer right-click opens it at the pointer; the
// keyboard, which has no pointer, opens it beside the element.
describe('rightClickMenuAnchor', () => {
  const element = { left: 100, right: 300, top: 50 };
  const pointer = { x: 180, y: 90 };

  it('opens at the pointer for a pointer right-click', () => {
    expect(rightClickMenuAnchor({ pointer, element, fromKeyboard: false })).toEqual(
      pointerMenuAnchor(pointer),
    );
  });

  it('opens beside the element for the keyboard', () => {
    expect(rightClickMenuAnchor({ pointer, element, fromKeyboard: true })).toEqual(
      elementMenuAnchor(element),
    );
  });

  it('falls back to the pointer when the keyboard opens an element that cannot be measured', () => {
    expect(rightClickMenuAnchor({ pointer, element: null, fromKeyboard: true })).toEqual(pointer);
  });
});

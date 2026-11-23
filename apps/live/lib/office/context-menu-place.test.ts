import { describe, expect, it } from 'vitest';
import { contextMenuPlace, submenuLift } from './context-menu-place';

const VIEW = { width: 1000, height: 800 };
const SIZE = { width: 240, height: 300 };

// docs/specs/004-interface-design/office-shell.md "Context menus": it stays inside the window.
describe('contextMenuPlace', () => {
  it('opens at the point where there is room', () => {
    expect(contextMenuPlace({ x: 100, y: 100 }, SIZE, VIEW)).toEqual({ left: 100, top: 100 });
  });

  it('opens to the left near the right edge, and above near the bottom', () => {
    expect(contextMenuPlace({ x: 900, y: 700 }, SIZE, VIEW)).toEqual({ left: 660, top: 400 });
  });

  it('never goes past the top-left corner', () => {
    expect(contextMenuPlace({ x: 100, y: 200 }, SIZE, { width: 300, height: 400 })).toEqual({
      left: 8,
      top: 8,
    });
  });
});

// docs/specs/004-interface-design/office-shell.md "Menu bar": a submenu that would cross the bottom edge moves up.
describe('submenuLift', () => {
  it('leaves a submenu that fits where it is', () => {
    expect(submenuLift({ top: 100, bottom: 400 }, 800)).toBe(0);
    expect(submenuLift({ top: 100, bottom: 792 }, 800)).toBe(0);
  });

  it('moves one crossing the bottom edge up until it fits, 8 px clear', () => {
    expect(submenuLift({ top: 600, bottom: 926 }, 900)).toBe(34);
  });

  it('never moves it past the window top', () => {
    expect(submenuLift({ top: 50, bottom: 1200 }, 900)).toBe(42);
    expect(submenuLift({ top: 4, bottom: 1200 }, 900)).toBe(0);
  });
});

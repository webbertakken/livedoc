import { describe, expect, it } from 'vitest';
import { contextMenuPlace } from './context-menu-place';

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

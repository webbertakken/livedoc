// docs/specs/004-interface-design/office-shell.md "Toolbar": a popup opens under its control, kept in the window.
import { describe, expect, it } from 'vitest';
import { popupPlace } from './popup-place';

const viewport = { width: 1000, height: 600 };
const size = { width: 200, height: 300 };

describe('popupPlace', () => {
  it('opens under its control', () => {
    expect(popupPlace({ left: 100, top: 40, bottom: 70 }, size, viewport)).toEqual({
      left: 100,
      top: 74,
    });
  });

  it('opens above when there is no room below', () => {
    expect(popupPlace({ left: 100, top: 500, bottom: 530 }, size, viewport)).toEqual({
      left: 100,
      top: 196,
    });
  });

  it('stays below when there is no room above either, and slides left inside the window', () => {
    expect(
      popupPlace({ left: 900, top: 200, bottom: 230 }, { width: 200, height: 500 }, viewport),
    ).toEqual({
      left: 792,
      top: 234,
    });
    expect(popupPlace({ left: -20, top: 40, bottom: 70 }, size, viewport).left).toBe(8);
  });
});

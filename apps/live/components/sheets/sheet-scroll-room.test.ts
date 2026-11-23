import { describe, expect, it } from 'vitest';
import { domScrollOf, scrollRoom, SCROLL_ROOM_MAX_PX, sheetScrollOf } from './sheet-scroll-room';

// docs/specs/029-sheets/grid-and-editing.md "The grid"; surface.md D134.
describe('scrollRoom', () => {
  const view = { width: 800, height: 400 };

  it('keeps a sheet within the room as it is, one to one', () => {
    const room = scrollRoom({ width: 2_646, height: 21_024 }, view);
    expect(room).toEqual({ spacer: { width: 2_646, height: 21_024 }, ratio: { x: 1, y: 1 } });
    expect(sheetScrollOf(room, { top: 300, left: 40 })).toEqual({ top: 300, left: 40 });
  });

  it('holds a million rows under the ceiling, both ends meeting', () => {
    const content = { width: 1_827_846, height: 21_000_024 };
    const room = scrollRoom(content, view);
    expect(room.spacer).toEqual({ width: 1_827_846, height: SCROLL_ROOM_MAX_PX });
    const end = sheetScrollOf(room, { top: SCROLL_ROOM_MAX_PX - view.height, left: 0 });
    expect(end.top).toBeCloseTo(content.height - view.height, 6);
    expect(sheetScrollOf(room, { top: 0, left: 0 })).toEqual({ top: 0, left: 0 });
  });

  it('maps a sheet scroll to the room and back', () => {
    const room = scrollRoom({ width: 30_000_000, height: 40_000_000 }, view, 1_000_000);
    const sheet = { top: 12_345_678, left: 9_876_543 };
    const back = sheetScrollOf(room, domScrollOf(room, sheet));
    expect(back.top).toBeCloseTo(sheet.top, 4);
    expect(back.left).toBeCloseTo(sheet.left, 4);
  });
});

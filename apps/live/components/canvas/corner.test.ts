import { describe, expect, it } from 'vitest';
import { CORNER_BAND_PX, CORNER_TOP_PX, TRAY_ROOM_PX, cornerTopPx } from './corner';

// docs/specs/021-event-storming/suggestions.md "The suggestions corner": clear of the top line, and below the
// toolbar strip where the strip reaches into the corner's band.
const strip = (left: number, width: number, top = 66, height = 46) => ({
  left,
  width,
  top,
  bottom: top + height,
});

describe('cornerTopPx', () => {
  it('stands 64 px down with no strip, or a strip clear of the corner', () => {
    expect(cornerTopPx(null, 1280)).toBe(CORNER_TOP_PX);
    expect(CORNER_TOP_PX).toBe(64);
    // A desktop strip centred on the top line.
    expect(cornerTopPx(strip(400, 480, 12), 1280)).toBe(64);
  });

  it('starts below a phone’s strip and its tray’s room when the strip reaches the corner’s band', () => {
    // A phone: the strip spans its own row under the top line.
    expect(cornerTopPx(strip(12, 366), 390)).toBe(112 + TRAY_ROOM_PX);
    // Reaching into the band by a pixel is enough.
    expect(cornerTopPx(strip(0, 1280 - 12 - CORNER_BAND_PX + 1), 1280)).toBe(112 + TRAY_ROOM_PX);
  });

  it('never stands higher than its own top', () => {
    expect(cornerTopPx(strip(12, 366, 0, 10), 390)).toBe(64);
  });
});

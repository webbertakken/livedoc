// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { TURN_FRAME_ATTR, turnFramePivotClient } from './turn-frame';

// docs/specs/008-canvas/selection-transforms.md "Rotating by hand": a zone pivots on its frame's centre.
describe('turnFramePivotClient', () => {
  it("reads the centre of the zone's frame on screen", () => {
    const frame = document.createElement('div');
    frame.setAttribute(TURN_FRAME_ATTR, '');
    const zone = document.createElement('div');
    frame.append(zone);
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: 40,
      height: 20,
    } as DOMRect);
    expect(turnFramePivotClient(zone)).toEqual({ x: 120, y: 60 });
  });

  it('has none outside a frame or for a target that is no element', () => {
    expect(turnFramePivotClient(document.createElement('div'))).toBeNull();
    expect(turnFramePivotClient(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  ES_LANES,
  ES_NOTE_GAP,
  LANE_NAME_WIDTH,
  laneCentre,
  laneNameElement,
} from '@livedoc/document';
import { hugsText } from '@/lib/text-hug';
import { blankLaneName } from './lane-name';

// A lane name about to be typed (docs/specs/021-event-storming/board-structure.md "Lane names").
describe('blankLaneName', () => {
  const name = blankLaneName('n', { lane: 2, wallLeft: 500 });

  it('stands one gutter left of the wall, right aligned and muted, as the board writes a lane name', () => {
    expect(name.x + name.width).toBe(500 - ES_NOTE_GAP);
    expect(name.width).toBe(LANE_NAME_WIDTH);
    expect(name.textAlignX).toBe('right');
    expect(name.textColor).toBe(
      laneNameElement({ id: 'n', name: '', lane: 2, wallLeft: 500 }).textColor,
    );
    expect(name.label).toBe('');
  });

  it('is one line tall on the lane’s centre, and hugs its text', () => {
    expect(name.y + name.height / 2).toBe(laneCentre(2, ES_LANES));
    expect(name.height).toBeLessThan(40);
    expect(hugsText(name)).toBe(true);
  });
});

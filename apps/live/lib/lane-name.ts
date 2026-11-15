import { ES_LANES, laneCentre, laneNameElement, type TextElement } from '@livedoc/document';
import { TEXT_HUG_LEADING, textHugFontPx, textHugPadding } from '@/lib/text-hug';

// A lane name about to be typed (docs/specs/021-event-storming/board-structure.md "Lane names"): the board's own
// lane name, blank, one line tall on the lane's centre. It wraps at its width and hugs its lines, so it stays
// centred on its lane as it is typed, and a name left blank goes as any empty text box does.
export function blankLaneName(id: string, spot: { lane: number; wallLeft: number }): TextElement {
  const base: TextElement = {
    ...laneNameElement({ id, name: '', lane: spot.lane, wallLeft: spot.wallLeft }),
    sizing: 'wrap',
  };
  const height = Math.ceil(textHugFontPx(base) * TEXT_HUG_LEADING) + 2 * textHugPadding(base).y;
  return { ...base, y: laneCentre(spot.lane, ES_LANES) - height / 2, height };
}

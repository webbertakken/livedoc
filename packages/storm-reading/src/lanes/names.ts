// The lane names a plan writes (docs/specs/021-event-storming/lane-plans.md "The plan", board-structure.md "Lane
// names"): the names the board has are rewritten top to bottom, those left over go, and a lane with none gets one.
// A name is ordinary text left of the wall, so the reading finds what is written here.

import {
  ES_LANES,
  laneCentre,
  laneNameElement,
  type Element,
  type ElementId,
  type Tab,
  type TextElement,
} from '@livedoc/document';
import { readNotes } from '../notes';
import { laneNameTexts } from '../structure';

// The text with other words on another lane; label formatting described the old words, so it goes.
function renamed(text: TextElement, name: string, lane: number): TextElement {
  const { richText: _runs, ...rest } = text;
  return { ...rest, label: name, y: laneCentre(lane, ES_LANES) - text.height / 2 };
}

/** `placed` (the board `tab` with its notes where a plan stands them) with `names` on the lanes from `top` down. */
export function withLaneNames(
  tab: Pick<Tab, 'elements'>,
  placed: Element[],
  names: readonly string[],
  top: number,
  makeId: () => string,
): Element[] {
  const was = readNotes(tab);
  const now = readNotes({ elements: placed });
  if (was.length === 0 || now.length === 0) return placed;

  // Only a lane that holds workshop notes has a name read.
  const used = new Set(was.map((n) => n.lane));
  const held = [...laneNameTexts(tab, Math.min(...was.map((n) => n.left)))]
    .filter(([lane]) => used.has(lane))
    .sort(([a], [b]) => a - b)
    .map(([, text]) => text);
  const rewritten = new Map<ElementId, TextElement | null>(
    held.map((text, i) => [text.id, i < names.length ? renamed(text, names[i]!, top + i) : null]),
  );
  const kept = placed.flatMap((el) => {
    const next = rewritten.get(el.id);
    return next === undefined ? [el] : next === null ? [] : [next];
  });

  const wallLeft = Math.min(...now.map((n) => n.left));
  const layerId = placed.find((el) => el.id === now[0]!.id)!.layerId;
  const added = names.slice(held.length).map((name, i) =>
    laneNameElement({
      id: makeId(),
      name,
      lane: top + held.length + i,
      wallLeft,
      ...(layerId !== undefined ? { layerId } : {}),
    }),
  );
  return [...kept, ...added];
}

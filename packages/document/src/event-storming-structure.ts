// What an event-storming board carries on its notes beyond their words (docs/specs/021-event-storming/
// board-structure.md): the pivotal mark on a domain event and the answer on a hotspot. Pure: every write answers the
// board after it, unchanged (the same array) when nothing changes.

import { eventStormingKindOf } from './event-storming';
import {
  ES_LANES,
  ES_LANE_HEIGHT,
  ES_LANE_PITCH,
  ES_NOTE_GAP,
  laneCentre,
  laneIndexAt,
  laneTop,
} from './event-storming-lanes';
import { isSuggestion } from './event-storming-suggestions';
import { GRAPH_MUTED } from './graph-muted';
import type { Element, ElementId, StickyElement, TextElement } from './index';

/** The longest hotspot answer, characters (safe range: 100 to 1000; it shows as a caption). */
export const HOTSPOT_ANSWER_MAX = 300;
/** The longest lane name the reading reads and a lane plan writes, characters (safe range: 20 to 80). */
export const LANE_NAME_MAX = 40;

/** How wide a lane name is written, and how tall, canvas px: the storm graph's labels. */
export const LANE_NAME_WIDTH = 180;
export const LANE_NAME_HEIGHT = 32;

/** A lane's name as the board writes it: muted text, right aligned, one gutter clear of the wall, on the lane. */
export function laneNameElement(input: {
  id: ElementId;
  name: string;
  lane: number;
  /** The wall's left edge: the left-most workshop note's x. */
  wallLeft: number;
  layerId?: string;
}): TextElement {
  return {
    id: input.id,
    type: 'text',
    x: input.wallLeft - ES_NOTE_GAP - LANE_NAME_WIDTH,
    y: laneCentre(input.lane, ES_LANES) - LANE_NAME_HEIGHT / 2,
    width: LANE_NAME_WIDTH,
    height: LANE_NAME_HEIGHT,
    label: input.name,
    textSize: 'md',
    textColor: GRAPH_MUTED,
    textAlignX: 'right',
    ...(input.layerId !== undefined ? { layerId: input.layerId } : {}),
  };
}

type Note = Parameters<typeof eventStormingKindOf>[0];
type Marked = Note & { esPivotal?: unknown };
type Answered = Note & { esAnswer?: unknown };

/** A domain event marked pivotal; a mark on any other note counts for nothing. */
export function isPivotalEvent(el: Marked): boolean {
  return el.esPivotal === true && eventStormingKindOf(el) === 'domain-event';
}

/** How wide a pivotal event's tape is, canvas px (safe range: 4 to 12; narrower than a note's margin). */
export const PIVOTAL_TAPE_PX = 6;

/** A pivotal event's tape: a vertical band through its event's centre. */
export type PivotalTape = {
  eventId: ElementId;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** The tape of every pivotal event among `shown`, in document order: through the event's centre, from half a lane
 *  above the top-most lane the shown workshop notes use to half a lane below the lowest. A suggestion is no note of
 *  the board yet, so it measures nothing and wears no tape. */
export function pivotalTapes(
  elements: readonly Element[],
  shown: readonly Element[] = elements,
): PivotalTape[] {
  const notes = shown.filter(
    (el): el is StickyElement =>
      el.type === 'sticky' && eventStormingKindOf(el) !== null && !isSuggestion(el),
  );
  const events = notes.filter(isPivotalEvent);
  if (events.length === 0) return [];
  const lanes = notes.map((n) => laneIndexAt(n.y + n.height / 2, ES_LANES));
  const y = laneTop(Math.min(...lanes), ES_LANES) - ES_LANE_PITCH / 2;
  const bottom = laneTop(Math.max(...lanes), ES_LANES) + ES_LANE_HEIGHT + ES_LANE_PITCH / 2;
  return events.map((event) => ({
    eventId: event.id,
    x: event.x + event.width / 2 - PIVOTAL_TAPE_PX / 2,
    y,
    width: PIVOTAL_TAPE_PX,
    height: bottom - y,
  }));
}

/** An answer a hotspot may carry: text within the limit. */
export function isValidEsAnswer(v: unknown): v is string {
  return typeof v === 'string' && v.length <= HOTSPOT_ANSWER_MAX;
}

const cleanAnswer = (text: unknown): string =>
  typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, HOTSPOT_ANSWER_MAX) : '';

/** A hotspot's answer, whitespace collapsed; empty while the question is open, and for any other note. */
export function answerOf(el: Answered): string {
  return eventStormingKindOf(el) === 'hotspot' ? cleanAnswer(el.esAnswer) : '';
}

function patch(
  elements: Element[],
  id: ElementId,
  change: (el: Element) => Element | null,
): Element[] {
  const index = elements.findIndex((el) => el.id === id);
  if (index < 0) return elements;
  const next = change(elements[index]!);
  if (next === null) return elements;
  const out = [...elements];
  out[index] = next;
  return out;
}

/** Mark a domain event pivotal, or unmark it. */
export function setPivotal(elements: Element[], id: ElementId, on: boolean): Element[] {
  return patch(elements, id, (el) => {
    if (eventStormingKindOf(el) !== 'domain-event' || isPivotalEvent(el) === on) return null;
    const { esPivotal: _dropped, ...rest } = el as Element & { esPivotal?: true };
    return (on ? { ...rest, esPivotal: true } : rest) as Element;
  });
}

/** Keep an answer on a hotspot; a blank one reopens the question. */
export function setAnswer(elements: Element[], id: ElementId, text: string): Element[] {
  return patch(elements, id, (el) => {
    const next = cleanAnswer(text);
    if (eventStormingKindOf(el) !== 'hotspot' || answerOf(el) === next) return null;
    const { esAnswer: _dropped, ...rest } = el as Element & { esAnswer?: string };
    return (next ? { ...rest, esAnswer: next } : rest) as Element;
  });
}

// What an event-storming board carries on its notes beyond their words (docs/specs/021-event-storming/
// board-structure.md): the pivotal mark on a domain event and the answer on a hotspot. Pure: every write answers the
// board after it, unchanged (the same array) when nothing changes.

import { eventStormingKindOf } from './event-storming';
import { ES_LANES, ES_NOTE_GAP, laneCentre } from './event-storming-lanes';
import { GRAPH_MUTED } from './graph-muted';
import type { Element, ElementId, TextElement } from './index';

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

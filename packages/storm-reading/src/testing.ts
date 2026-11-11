// Boards for the reading's tests, laid out the way people lay them out: notes on lanes, a column a rhythm step apart.

import {
  ES_LANES,
  ES_NOTE_GAP,
  eventStormingNoteSize,
  laneCentre,
  type Element,
  type EventStormingNoteKind,
  type Tab,
} from '@livedoc/document';

// One rhythm step: a square note and a gutter.
export const STEP = 200 + ES_NOTE_GAP;

export type NoteSpec = {
  id: string;
  kind: EventStormingNoteKind;
  // Column (in rhythm steps, fractional allowed) and lane.
  col: number;
  lane?: number;
  words?: string;
  // Extra element fields.
  extra?: Record<string, unknown>;
};

export function note({ id, kind, col, lane = 0, words, extra }: NoteSpec): Element {
  const size = eventStormingNoteSize(kind);
  const sticky: Element = {
    id,
    type: 'sticky',
    x: col * STEP,
    y: laneCentre(lane, ES_LANES) - size.height / 2,
    ...size,
    label: words ?? id,
    esKind: kind,
    fixedSize: true,
    ...extra,
  };
  return sticky;
}

export function board(...specs: (NoteSpec | Element)[]): Tab {
  const tab: Tab = {
    id: 'tab-1',
    name: 'Board',
    kind: 'event-storming',
    elements: specs.map((s) => ('type' in s ? s : note(s))),
  };
  return tab;
}

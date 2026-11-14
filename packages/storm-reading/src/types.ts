// The board reading's shapes (docs/specs/021-event-storming/board-reading.md "Output"). `StormReading` is the
// `storm.json` of the domain export, so its JSON is a contract: ids are stable element ids, refs are the views'
// short names for them at the time of reading.

import type { ElementId, EsSuggestionSide, EventStormingNoteKind } from '@livedoc/document';

export const STORM_SCHEMA = 'livedoc.storm/1';

// One workshop note as the reading sees it.
export type StormNote = {
  id: ElementId;
  ref: string;
  kind: EventStormingNoteKind;
  words: string;
  lane: number;
  // Position in the reading: timeline order, then loose notes.
  order: number;
};

// Where a note sits and what it carries, for the relations and the structure; never part of the JSON.
export type PlacedNote = Omit<StormNote, 'order'> & {
  index: number;
  // A domain event marked pivotal (docs/specs/021-event-storming/board-structure.md).
  pivotal: boolean;
  // A hotspot's answer; empty while it is open, and for every other kind.
  answer: string;
  cx: number;
  cy: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

// Each relation maps a note to its one partner (docs/specs/021-event-storming/board-reading.md "Relations").
export type StormRelations = {
  // command -> the event it causes
  causes: Record<ElementId, ElementId>;
  // policy -> the event that triggers it
  triggers: Record<ElementId, ElementId>;
  // policy or actor -> the command it issues
  issues: Record<ElementId, ElementId>;
  // read model -> the command it informs
  informs: Record<ElementId, ElementId>;
  // aggregate or external system -> the event it decides
  decides: Record<ElementId, ElementId>;
  // hotspot -> the note it flags
  flags: Record<ElementId, ElementId>;
};

export type StormCommandEntry = {
  command: ElementId;
  actors: ElementId[];
  readModels: ElementId[];
  // The policy that issues it, when one does.
  policy: ElementId | null;
};

export type StormPolicyEntry = {
  policy: ElementId;
  // The command it issues, when it issues one.
  issues: ElementId | null;
};

// One event on the timeline and what relates to it.
export type StormMoment = {
  event: ElementId;
  commands: StormCommandEntry[];
  // Aggregates and external systems.
  deciders: ElementId[];
  policies: StormPolicyEntry[];
  hotspots: ElementId[];
};

// event -> policy -> command -> event: one step of a process across the board.
export type StormChain = {
  from: ElementId;
  policy: ElementId;
  command: ElementId;
  to: ElementId | null;
};

export type GapLevel = 'notation' | 'flow' | 'question';

export const GAP_CODES = [
  'event_without_cause',
  'command_without_event',
  'command_without_trigger',
  'policy_without_trigger',
  'policy_without_command',
  'read_model_unused',
  'blank_note',
  'event_not_past_tense',
  'command_not_imperative',
  'duplicate_note',
  'open_hotspot',
  'event_without_context',
] as const;
export type GapCode = (typeof GAP_CODES)[number];

// The note that would close a gap: its kind, and on which side of which note it goes.
export type GapRemedy = {
  kind: EventStormingNoteKind;
  side: EsSuggestionSide;
  anchor: ElementId;
};

export type StormGap = {
  code: GapCode;
  level: GapLevel;
  ids: ElementId[];
  message: string;
  remedy: GapRemedy | null;
};

export type StormReading = {
  schema: typeof STORM_SCHEMA;
  board: { tabId: string; name: string; documentId?: string };
  notes: StormNote[];
  relations: StormRelations;
  timeline: StormMoment[];
  chains: StormChain[];
  loose: ElementId[];
  gaps: StormGap[];
  // The kept candidate contexts (docs/specs/021-event-storming/candidate-contexts.md "In the reading and the export"),
  // in timeline order of their first note. Absent in a reading made before contexts: read as none.
  contexts: StormContext[];
  // The board's About (docs/specs/021-event-storming/asks.md "About This Domain"); only when it has one.
  about?: string;
  // The board's structure (docs/specs/021-event-storming/board-reading.md "Structure") and its context map. Absent in
  // a reading made before them: read as none.
  lanes: StormLane[];
  pivotal: ElementId[];
  phases: StormPhase[];
  decisions: StormDecision[];
  contextMap: StormContextLink[];
};

// A lane that holds workshop notes: its number from the top (from 1), the lane index it is, its name when a text
// stands left of the wall on it, and its notes left to right.
export type StormLane = {
  number: number;
  lane: number;
  name: string | null;
  notes: ElementId[];
};

// The run of events a pivotal event closes; the last run, which none closes, has `closes: null`.
export type StormPhase = {
  closes: ElementId | null;
  events: ElementId[];
};

// An answered hotspot: the question, what the room decided, and the note it was asked about.
export type StormDecision = {
  hotspot: ElementId;
  question: string;
  answer: string;
  flags: ElementId | null;
};

// A relation of the flow whose two notes sit in two different kept contexts, in the direction the flow runs.
export type CrossingRelation = 'triggers' | 'issues' | 'causes';
export type StormCrossing = {
  relation: CrossingRelation;
  from: ElementId;
  to: ElementId;
};

// What crosses from one kept context (upstream) to another (downstream), by context id.
export type StormContextLink = {
  from: ElementId;
  to: ElementId;
  crossings: StormCrossing[];
};

// A kept candidate context: its name and its notes, in reading order.
export type StormContext = {
  id: ElementId;
  ref: string;
  name: string;
  notes: ElementId[];
};

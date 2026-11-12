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

// Where a note sits, for the relations; never part of the JSON.
export type PlacedNote = Omit<StormNote, 'order'> & {
  index: number;
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
};

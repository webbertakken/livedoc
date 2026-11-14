// The built-in hand of an ask (docs/specs/021-event-storming/asks.md "The built-in hand"): the wire contract between
// the api route that has the deployment's model answer and runs its lines through the edit-operation engine, and
// the editor that adds what came back. The board travels in the request, so a board saved only in This Browser can
// ask too; nothing is stored.

import type { Element, ElementId, EsDeclined, EsNoteChange, Layer } from '@livedoc/document';

// What an ask is about: `AskScope` of @livedoc/storm-reading, as it travels.
export type StormAskScope =
  | { type: 'board' }
  | { type: 'notes'; ids: ElementId[] }
  | { type: 'context'; id: ElementId }
  | { type: 'contexts'; ids: ElementId[] };

// POST /api/storm-ask
export type StormAskRequest = {
  // One of STORM_ASK_TOPICS (@livedoc/storm-reading).
  topic: string;
  scope: StormAskScope;
  // How many lanes the board is to fit, for the topic `lanes`: 2 to 12.
  lanes?: number;
  // The board as the person sees it.
  tab: {
    id: string;
    name: string;
    kind?: string;
    elements: Element[];
    layers?: Layer[];
    esAbout?: string;
    esDeclined?: EsDeclined[];
  };
};

// What to add to the board: `AskAnswer` of @livedoc/storm-reading, with how the model's lines fared.
export type StormAskResponse = {
  // New suggestion elements: suggested notes, suggested contexts, a lane plan.
  added: Element[];
  // Name suggestions and note changes, by the elements they belong on.
  names: { contexts: ElementId[]; name: string; reason?: string; by?: string }[];
  changes: { note: ElementId; change: EsNoteChange }[];
  // How many lines the model answered, and how many of them were not taken.
  lines: number;
  dropped: number;
  // The topic `lanes`, when no plan of the model's kept what the board says: true when the board's own fold is the
  // plan added, else why there is none (the board already fits, or no arrangement in that many lanes keeps it).
  folded?: true | 'fits' | 'no_arrangement';
};

export type StormAskError =
  | 'not_event_storming'
  | 'topic_invalid'
  | 'scope_invalid'
  | 'lanes_invalid'
  | 'board_too_large'
  | 'ai_failed';

// The largest board an ask reads, in workshop notes, and the largest request, in bytes. Safe ranges: 100 to 1,000
// notes (the reading is printed whole into the prompt); 256 KB to 4 MB.
export const STORM_ASK_MAX_NOTES = 400;
export const STORM_ASK_MAX_BYTES = 1_048_576;

// The event-storming tools' input and output shapes (docs/specs/015-api/mcp-server.md §4.9f): read_event_storming and
// suggest_notes. Notes are named by the refs the reading prints; the limits come from the suggestion model, so the tools
// and the engine agree.
import { z } from 'zod';
import { PHOTO_MAX_NOTES } from '@livedoc/api-schema';
import {
  CONTEXT_NAME_MAX,
  ES_SUGGESTION_SIDES,
  EVENT_STORMING_NOTES,
  LANE_NAME_MAX,
  LANES_MAX,
  LANES_MIN,
  NOTE_CHANGE_TYPES,
  NOTE_CHANGE_WORDS_MAX,
  SPLIT_PARTS_MAX,
  SUGGESTION_REASON_MAX,
  TERM_MAX,
  WALL_MAX_PHOTOS,
} from '@livedoc/document';
import { DOMAIN_EXPORT_LANGUAGES, GAP_CODES } from '@livedoc/storm-reading';
import { SUGGEST_NOTES_MAX } from '../storm/storm-calls';

const url = z.string().describe('Link that opens the document in the LiveDoc editor.');
const documentId = z.string().describe('The document (from find_documents).');
const tab = z
  .string()
  .optional()
  .describe(
    'The Event Storming tab, by id or name. Absent: the document’s first Event Storming board.',
  );
const kinds = EVENT_STORMING_NOTES.map((n) => n.kind) as [string, ...string[]];

export const readEventStormingShape = { documentId, tab };

export const readEventStormingOutput = {
  documentId: z.string().describe('The document.'),
  tabId: z.string().describe('The board.'),
  text: z
    .string()
    .describe(
      'The reading: the About (what the person says the domain is) when the board has one; one line per note in ' +
        'timeline order: each event ("<n> event <ref> \\"words\\"", a pivotal one ending "· pivotal") with what leads ' +
        'to it ("<-" command · actor · read-model · policy), decides it ("@"), follows it ("->" policy => command) ' +
        'and flags it ("!", an answered hotspot ending = "answer"); then loose notes, the lanes in use (number ' +
        '"name": refs), candidate contexts (ref "name": refs), the context map (context -> context: what crosses), ' +
        'gaps (level code refs: message (remedy)), open suggestions (notes, and contexts as ref context "name" ' +
        'refs), suggested changes (the refs it is on, then name "…", reword "…", kind …, split "…" | "…" or remove), ' +
        'the open lane plan (its ref, its lanes top to bottom with how many notes each holds; stale when the board ' +
        'changed since), and what was declined (type, kind, words, the refs it was about).',
    ),
  reading: z
    .record(z.string(), z.unknown())
    .describe(
      'The board reading as data (schema livedoc.storm/1): notes, relations, timeline, chains, loose, gaps, ' +
        'contexts, about, lanes, pivotal, phases, decisions, contextMap.',
    ),
  gaps: z.number().describe('How many gaps the reading found.'),
  suggestions: z
    .number()
    .describe(
      'How many suggestions are open on the board: notes, contexts, names, note changes and a lane plan.',
    ),
  url,
};

const suggestion = z.object({
  kind: z.enum(kinds).describe(`The note kind: ${kinds.join(', ')}.`),
  words: z
    .string()
    .describe('What the note would say, in the board’s language and casing (a past-tense event).'),
  anchor: z
    .string()
    .describe(
      'The ref of the note (or suggestion) it goes against, as read_event_storming prints it.',
    ),
  side: z
    .enum(ES_SUGGESTION_SIDES as [string, ...string[]])
    .describe(
      'before or after: along the anchor’s lane (time runs left to right); above or below: the next lane.',
    ),
  reason: z
    .string()
    .max(SUGGESTION_REASON_MAX)
    .optional()
    .describe(`Why, for the person deciding, up to ${SUGGESTION_REASON_MAX} characters.`),
  gap: z
    .enum(GAP_CODES as unknown as [string, ...string[]])
    .optional()
    .describe('The gap code it closes, when it closes one.'),
});

// A candidate context (docs/specs/021-event-storming/candidate-contexts.md "How an agent suggests one").
const contextSuggestion = z.object({
  name: z
    .string()
    .max(CONTEXT_NAME_MAX)
    .describe(
      `The part of the business, in its own words, up to ${CONTEXT_NAME_MAX} characters ("Billing").`,
    ),
  notes: z
    .array(z.string())
    .min(1)
    .describe(
      'The refs of the workshop notes it groups, as read_event_storming prints them; none already in a context.',
    ),
  reason: z
    .string()
    .max(SUGGESTION_REASON_MAX)
    .optional()
    .describe(`Why these belong together, up to ${SUGGESTION_REASON_MAX} characters.`),
});

// Another name for a candidate context, or one name for several merged
// (docs/specs/021-event-storming/suggested-changes.md "Name suggestions").
const nameSuggestion = z.object({
  name: z
    .string()
    .max(CONTEXT_NAME_MAX)
    .describe(
      `The name, in the business’s own words, up to ${CONTEXT_NAME_MAX} characters ("Fulfilment").`,
    ),
  contexts: z
    .array(z.string())
    .min(1)
    .describe(
      'The refs of the candidate contexts it is for, kept or suggested, as read_event_storming prints them: one ' +
        'context for another name for it, several for one name for them merged.',
    ),
  reason: z
    .string()
    .max(SUGGESTION_REASON_MAX)
    .optional()
    .describe(`Why this name, up to ${SUGGESTION_REASON_MAX} characters.`),
});

// A change to one workshop note (suggested-changes.md "Note changes").
const noteChange = z.object({
  note: z.string().describe('The ref of the workshop note, as read_event_storming prints it.'),
  change: z
    .enum(NOTE_CHANGE_TYPES)
    .describe(
      'reword: other words (words; and term with to when one word changes). kind: another note kind (kind). ' +
        'split: several notes for one that holds several facts (parts). remove: take it off the board, as a ' +
        'duplicate or a stray.',
    ),
  words: z
    .string()
    .max(NOTE_CHANGE_WORDS_MAX)
    .optional()
    .describe('reword: what the note would say, in the board’s language and casing.'),
  term: z
    .string()
    .max(TERM_MAX)
    .optional()
    .describe(
      'reword: the word of the note that changes ("Order"), when the change is to that word. With it, a person ' +
        'accepting the reword also rewords every note of the same candidate context that holds the word.',
    ),
  to: z.string().max(TERM_MAX).optional().describe('reword: what the term becomes ("Booking").'),
  kind: z
    .enum(kinds)
    .optional()
    .describe(`kind: the kind it should be: ${kinds.join(', ')}.`),
  parts: z
    .array(z.string().max(NOTE_CHANGE_WORDS_MAX))
    .min(2)
    .max(SPLIT_PARTS_MAX)
    .optional()
    .describe(
      `split: the words of each note, 2 to ${SPLIT_PARTS_MAX}; the first stays on this note, the others land after it.`,
    ),
  reason: z
    .string()
    .max(SUGGESTION_REASON_MAX)
    .optional()
    .describe(`Why, for the person deciding, up to ${SUGGESTION_REASON_MAX} characters.`),
});

// One lane of a lane plan (docs/specs/021-event-storming/lane-plans.md "How an agent suggests one").
const lane = z.object({
  name: z
    .string()
    .max(LANE_NAME_MAX)
    .describe(
      `What the lane holds, in the business’s words, up to ${LANE_NAME_MAX} characters ("Kitchen").`,
    ),
  lanes: z
    .array(z.number().int().min(1))
    .optional()
    .describe('Lanes of the board as it stands, by the number read_event_storming prints.'),
  kinds: z
    .array(z.enum(kinds))
    .optional()
    .describe(`Note kinds: every note of the kind. ${kinds.join(', ')}.`),
  contexts: z
    .array(z.string())
    .optional()
    .describe('Candidate contexts by ref: every note of the context.'),
  notes: z.array(z.string()).optional().describe('Workshop notes by ref.'),
});

export const suggestNotesShape = {
  documentId,
  tab,
  suggestions: z
    .array(suggestion)
    .max(SUGGEST_NOTES_MAX)
    .optional()
    .describe(
      `Notes to suggest. With contexts, names, changes and lanes, 1 to ${SUGGEST_NOTES_MAX} in all, written as one changeset: all or none.`,
    ),
  contexts: z
    .array(contextSuggestion)
    .max(SUGGEST_NOTES_MAX)
    .optional()
    .describe(
      'Candidate contexts to suggest: dashed outlines round groups of notes that belong to one part of the business.',
    ),
  names: z
    .array(nameSuggestion)
    .max(SUGGEST_NOTES_MAX)
    .optional()
    .describe(
      'Names to suggest for candidate contexts already on the board: another name for one, or one name for several merged.',
    ),
  changes: z
    .array(noteChange)
    .max(SUGGEST_NOTES_MAX)
    .optional()
    .describe(
      'Changes to suggest to notes already on the board: reword, kind, split or remove. Nothing changes until a person accepts one.',
    ),
  lanes: z
    .array(lane)
    .max(LANES_MAX)
    .optional()
    .describe(
      `A lane plan: the board reorganised into ${LANES_MIN} to ${LANES_MAX} lanes, top to bottom. Each lane says what ` +
        'it holds by notes, contexts, kinds or lanes, which may be mixed; the most specific takes a note (a ref, ' +
        'then a context, then a kind, then a lane). Every workshop note must end on a lane. The board places the ' +
        'notes, each keeping its place in time, and refuses a plan that would change what the board says.',
    ),
  lanesReason: z
    .string()
    .max(SUGGESTION_REASON_MAX)
    .optional()
    .describe(
      `Why these lanes, for the person deciding, up to ${SUGGESTION_REASON_MAX} characters.`,
    ),
};

export const suggestNotesOutput = {
  documentId: z.string().describe('The document.'),
  tabId: z.string().describe('The board.'),
  changesetId: z
    .string()
    .nullable()
    .describe('The changeset; revert it to take the suggestions back.'),
  lines: z.array(z.string()).describe('One result line per suggestion added, with its ref.'),
  url,
};

// A whole wall from several photos (docs/specs/021-event-storming/event-storming.md Phase 11).
const wallNote = z.object({
  kind: z
    .enum(kinds)
    .optional()
    .describe('The note kind by its paper colour; absent when unsure (a domain event).'),
  words: z
    .string()
    .optional()
    .describe('The words on the note, verbatim as written; absent when unreadable.'),
  x: z.number().describe('Left edge of the note in the photo, in pixels.'),
  y: z.number().describe('Top edge, in pixels.'),
  w: z.number().positive().describe('Width, in pixels.'),
  h: z.number().positive().describe('Height, in pixels.'),
});
const wallPhoto = z.object({
  width: z.number().positive().describe('The photo’s width in pixels.'),
  height: z.number().positive().describe('The photo’s height in pixels.'),
  notes: z
    .array(wallNote)
    .max(PHOTO_MAX_NOTES)
    .describe('Every sticky note you see in this photo.'),
});

export const addPhotoNotesShape = {
  documentId,
  tab,
  photos: z
    .array(wallPhoto)
    .min(1)
    .max(WALL_MAX_PHOTOS)
    .describe(
      `The photos of one wall in order, left to right, at most ${WALL_MAX_PHOTOS}. Overlapping photos are stitched: a note two photos both show lands once.`,
    ),
};

export const addPhotoNotesOutput = {
  documentId: z.string().describe('The document.'),
  tabId: z.string().describe('The board.'),
  changesetId: z.string().nullable().describe('The changeset; revert it to take the draft back.'),
  lines: z
    .array(z.string())
    .describe('One result line per note landed in the draft, with its ref.'),
  url,
};

export const exportEventStormingShape = {
  documentId,
  tab,
  language: z
    .enum(DOMAIN_EXPORT_LANGUAGES)
    .optional()
    .describe(
      'The language of the domain types. Absent: identify it from the repository you work in, and ask the person when it does not say.',
    ),
  previous: z
    .string()
    .optional()
    .describe(
      'The storm.json of the earlier export, as kept in the repository; it makes CHANGES.md.',
    ),
};

export const exportEventStormingOutput = {
  documentId: z.string().describe('The document.'),
  tabId: z.string().describe('The board.'),
  folder: z
    .string()
    .describe('Where the bundle belongs in the repository: .livedoc/storm/<board>/.'),
  files: z
    .array(
      z.object({
        name: z.string().describe('The file name, within the folder.'),
        text: z.string().describe('Its contents.'),
      }),
    )
    .describe(
      'The bundle: storm.json (keep it as the next baseline), storm.md, CHANGES.md (with previous), CONVERT.md (follow it), export.json.',
    ),
  changes: z.number().nullable().describe('How many changes since previous; null without it.'),
  url,
};

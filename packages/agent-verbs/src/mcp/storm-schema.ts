// The event-storming tools' input and output shapes (docs/specs/015-api/mcp-server.md §4.9f): read_event_storming and
// suggest_notes. Notes are named by the refs the reading prints; the limits come from the suggestion model, so the tools
// and the engine agree.
import { z } from 'zod';
import {
  ES_SUGGESTION_SIDES,
  EVENT_STORMING_NOTES,
  SUGGESTION_REASON_MAX,
} from '@livedoc/document';
import { GAP_CODES } from '@livedoc/storm-reading';
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
      'The reading, one line per note in timeline order: each event ("<n> event <ref> \\"words\\"") with what leads ' +
        'to it ("<-" command · actor · read-model · policy), decides it ("@"), follows it ("->" policy => command) ' +
        'and flags it ("!"); then loose notes, gaps (level code refs: message (remedy)), and open suggestions.',
    ),
  reading: z
    .record(z.string(), z.unknown())
    .describe(
      'The board reading as data (schema livedoc.storm/1): notes, relations, timeline, chains, loose, gaps.',
    ),
  gaps: z.number().describe('How many gaps the reading found.'),
  suggestions: z.number().describe('How many suggestions are open on the board.'),
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

export const suggestNotesShape = {
  documentId,
  tab,
  suggestions: z
    .array(suggestion)
    .min(1)
    .max(SUGGEST_NOTES_MAX)
    .describe(`1 to ${SUGGEST_NOTES_MAX} suggestions, written as one changeset: all or none.`),
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

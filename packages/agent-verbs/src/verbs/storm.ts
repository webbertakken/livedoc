// The storm verbs (docs/specs/015-api/cli.md, docs/specs/021-event-storming/suggestions.md "How an agent suggests"):
// `storm read` (read_event_storming), `storm suggest` (suggest_notes, its suggestions from a file of suggest lines) and
// `storm clear`, over the calls the MCP's tools share. A board is named by tab name or id; the first board otherwise.
import { z } from 'zod';
import { defineVerb, VerbRefusal, type Verb } from '../define';
import {
  clearSuggestions,
  readStorm,
  suggestFromText,
  type StormRead,
  type StormRefusal,
  type StormWrite,
} from '../storm/storm-calls';
import { documentOf } from './shared';

const docArg = z.string().describe('A name, id prefix or LiveDoc URL');
const tabFlag = z
  .string()
  .optional()
  .describe('The Event Storming tab, by name or id; the first board when omitted');
const HINT = 'read the board with: livedoc storm read <doc>';

function unwrap<T extends StormRead | StormWrite>(result: T | StormRefusal): T {
  if (result.ok) return result;
  throw new VerbRefusal({
    status: result.code === 'tab_not_found' ? 404 : 400,
    code: result.code,
    message: result.message,
    hint:
      result.code === 'not_event_storming'
        ? 'make one with: livedoc document create <name> --template event-storming'
        : HINT,
  });
}

const readOutput = z.object({
  documentId: z.string(),
  tabId: z.string(),
  gaps: z.number(),
  suggestions: z.number(),
  lines: z.array(z.string()),
});

const writeOutput = z.object({
  documentId: z.string(),
  tabId: z.string(),
  changesetId: z.string().nullable(),
  lines: z.array(z.string()),
});

async function boardOf(
  ctx: Parameters<NonNullable<Verb['run']>>[0],
  doc: string,
  tab: string | undefined,
) {
  const document = await documentOf(ctx, doc);
  return unwrap(await readStorm(ctx.api, document, tab));
}

export const stormRead = defineVerb({
  id: 'storm.read',
  summary: 'Read an Event Storming board: its timeline, gaps and suggestions',
  description:
    "Prints an Event Storming board's reading: one line per note in timeline order (each event with the commands, actors, read models, aggregates, policies and hotspots it relates to), the loose notes, the gaps with their remedies, and the open suggestions. Deterministic: no model reads it.",
  behaviour: 'read',
  input: z.object({ doc: docArg, tab: tabFlag }),
  output: readOutput,
  run: async (ctx, input) => {
    const read = await boardOf(ctx, input.doc, input.tab);
    return {
      documentId: read.documentId,
      tabId: read.tabId,
      gaps: read.reading.gaps.length,
      suggestions: read.suggestions.length,
      lines: read.lines,
    };
  },
  text: (o) => o.lines,
  cli: {
    positionals: ['doc'],
    examples: ['livedoc storm read "Order flow"', 'livedoc storm read 3f9c --tab Kitchen'],
    prints: 'the board line, the timeline, loose notes, gaps and open suggestions',
  },
});

export const stormSuggest = defineVerb({
  id: 'storm.suggest',
  summary: 'Suggest notes for an Event Storming board',
  description:
    'Sends suggest lines from a file (or stdin, with -f -) as one changeset: each a note proposed beside a note of the board, which a person applies or dismisses; nothing on the board moves. Line form: suggest <kind> "<words>" before|after|above|below=<note> [reason="…"] [gap=<code>].',
  behaviour: 'write',
  input: z.object({
    doc: docArg,
    tab: tabFlag,
    file: z.string().describe('A file of suggest lines, or - for stdin'),
  }),
  output: writeOutput,
  run: async (ctx, input) => {
    const read = await boardOf(ctx, input.doc, input.tab);
    const text = await ctx.readInput(input.file);
    const written = unwrap(await suggestFromText(ctx.api, read, text, 'cli'));
    return {
      documentId: written.documentId,
      tabId: written.tabId,
      changesetId: written.changesetId,
      lines: written.lines,
    };
  },
  text: (o) => [...o.lines, ...(o.changesetId ? [`changeset ${o.changesetId}`] : [])],
  quiet: (o) => (o.changesetId ? [o.changesetId] : []),
  cli: {
    positionals: ['doc'],
    flags: { file: { short: 'f' } },
    examples: [
      'livedoc storm suggest "Order flow" -f suggestions.txt',
      'echo \'suggest command "Place Order" before=e3 reason="who places it?"\' | livedoc storm suggest 3f9c -f -',
    ],
    prints: 'one line per suggestion added, then the changeset',
  },
});

export const stormClear = defineVerb({
  id: 'storm.clear',
  summary: "Remove an Event Storming board's open suggestions",
  description:
    'Removes every open suggestion on the board as one changeset, as Dismiss All does in the editor. Notes already applied stay.',
  behaviour: 'destructive',
  input: z.object({ doc: docArg, tab: tabFlag }),
  output: writeOutput,
  run: async (ctx, input) => {
    const read = await boardOf(ctx, input.doc, input.tab);
    const written = unwrap(await clearSuggestions(ctx.api, read, 'cli'));
    return {
      documentId: written.documentId,
      tabId: written.tabId,
      changesetId: written.changesetId,
      lines: written.lines,
    };
  },
  text: (o) =>
    o.lines.length ? [...o.lines, `changeset ${o.changesetId}`] : ['no open suggestions'],
  cli: {
    positionals: ['doc'],
    examples: ['livedoc storm clear "Order flow"', 'livedoc storm clear 3f9c --tab Kitchen'],
    prints: 'one line per suggestion removed, then the changeset',
  },
});

export const stormVerbs: Verb[] = [stormRead, stormSuggest, stormClear] as Verb[];

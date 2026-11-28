// The text document verbs (docs/specs/034-text-documents/agents-and-sync.md "Verbs", "CLI"): read a text document
// through its views, change it with text operations as one changeset, and, run by the CLI, download it as a file or
// open a file as a new one. The kind is its own resource, `text-document` (alias `text`), as a spreadsheet is.
import { z } from 'zod';
import { ApiError } from '@livedoc/api-client';
import type { TextChangesetRefusal, TextChangesetResponse } from '@livedoc/api-schema';
import { defineVerb, VerbRefusal, type Verb, type VerbContext } from '../define';
import { documentOf, tabPath } from './shared';

// What a text document downloads as (files-and-print.md "Downloading").
export const TEXT_DOCUMENT_DOWNLOAD_FORMATS = [
  'odt',
  'fodt',
  'docx',
  'txt',
  'md',
  'html',
  'epub',
  'rtf',
] as const;

const docArg = z.string().describe('A name, id prefix or LiveDoc URL');
const tabFlag = z
  .string()
  .optional()
  .describe('The text document tab, by name or id, when the document holds several');

type KindedTab = { id: string; name: string; orderIndex: number; kind?: string };

/** The document a command names and its text document tab: the one `tab` names, else its first. */
export async function textDocumentTabOf(ctx: VerbContext, doc: string, tab: string | undefined) {
  const document = await documentOf(ctx, doc);
  const tabs = (document.tabs as KindedTab[])
    .filter((t) => t.kind === 'text-document')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const named = tab?.toLowerCase();
  const found =
    named === undefined
      ? tabs[0]
      : (tabs.find((t) => t.id === tab) ??
        tabs.find((t) => t.name.toLowerCase() === named) ??
        tabs.find((t) => t.id.startsWith(tab!)));
  if (!found)
    throw new VerbRefusal({
      status: 404,
      code: 'not_a_text_document',
      message:
        tabs.length === 0
          ? `${document.name} holds no text document`
          : `${document.name} holds no text document tab ${JSON.stringify(tab)}`,
      lines: tabs.map((t) => `tab ${JSON.stringify(t.name)} ${t.id.slice(0, 8)}`),
      hint: 'name its text document tab with --tab, or list the tabs: livedoc tab ls <doc>',
    });
  return { document, tab: found };
}

export const textDocumentView = defineVerb({
  id: 'text-document.view',
  summary: 'Read a text document',
  description:
    'Prints a text document as one of its views: outline (document tabs and headings with paragraph numbers, the default), text (Markdown, pending suggestions marked) or structure (styles, tables, objects, comments, suggestions).',
  behaviour: 'read',
  input: z.object({
    doc: docArg,
    tab: tabFlag,
    as: z
      .enum(['outline', 'text', 'structure'])
      .optional()
      .describe('The view: outline, text or structure'),
    only: z.string().optional().describe('The document tab, by name or id'),
    range: z.string().optional().describe('Paragraph numbers, like 40..60 or 12'),
    lines: z.boolean().optional().describe('Put ¶<n> before each paragraph'),
  }),
  output: z.object({ text: z.string() }),
  run: async (ctx, input) => {
    const { document, tab } = await textDocumentTabOf(ctx, input.doc, input.tab);
    const query = new URLSearchParams({ view: input.as ?? 'outline' });
    if (input.only !== undefined) query.set('only', input.only);
    if (input.range !== undefined) query.set('range', input.range);
    if (input.lines) query.set('lines', '1');
    const { body } = await ctx.api.text(`${tabPath(document.id, tab.id)}?${query.toString()}`);
    return { text: body };
  },
  text: ({ text }) => [text],
  cli: {
    positionals: ['doc'],
    examples: [
      'livedoc text view "Launch plan"',
      'livedoc text view 3f9c --as text --lines --range 1..40',
    ],
    prints: 'the view',
  },
});

const refusalOf = (error: ApiError): VerbRefusal => {
  let refusal: Partial<TextChangesetRefusal> = {};
  try {
    refusal = JSON.parse(error.body) as Partial<TextChangesetRefusal>;
  } catch {
    // Not a refusal's JSON: the status and body speak for themselves below.
  }
  const where = refusal.line ? `line ${refusal.line}: ` : '';
  return new VerbRefusal({
    status: error.status,
    code: refusal.error ?? error.code ?? 'refused',
    message: `${where}${refusal.message ?? error.message}`,
    hint:
      refusal.error === 'text_ambiguous' || refusal.error === 'text_not_found'
        ? 'read it as it stands: livedoc text view <doc> --as text --lines'
        : 'the operations: livedoc guide text',
  });
};

export const textDocumentEdit = defineVerb({
  id: 'text-document.edit',
  summary: 'Change a text document',
  description:
    'Applies text operations as one changeset, all or nothing: the words as one operation, or --file (- for stdin) one a line. Prints a result line each, then the changeset to revert.',
  behaviour: 'write',
  input: z.object({
    doc: docArg,
    ops: z.array(z.string()).optional().describe('One operation, as words'),
    file: z.string().optional().describe('Operations one a line, from a file or - for stdin'),
    tab: tabFlag,
    documentTab: z
      .string()
      .optional()
      .describe('The document tab, by name or id; the first by default'),
    summary: z.string().optional().describe('What the change is, shown to people'),
    base: z.string().optional().describe('The X-State-Vector a view answered; replace needs it'),
    dryRun: z.boolean().optional().describe('Print the result lines and write nothing'),
  }),
  output: z.object({
    dryRun: z.boolean(),
    changeset: z
      .object({
        id: z.string(),
        counts: z.object({ added: z.number(), changed: z.number(), removed: z.number() }),
      })
      .nullable(),
    results: z.array(z.string()),
  }),
  run: async (ctx, input) => {
    if ((input.file === undefined) === !input.ops?.length)
      throw new VerbRefusal({
        status: 400,
        code: 'invalid_operation',
        message: 'give one operation as words, or --file with one a line',
        hint: `livedoc text edit <doc> edit '"old"' '"new"'`,
      });
    const ops = input.file !== undefined ? await ctx.readInput(input.file) : input.ops!.join(' ');
    const { document, tab } = await textDocumentTabOf(ctx, input.doc, input.tab);
    try {
      const answer = await ctx.api.json<TextChangesetResponse>(
        `${tabPath(document.id, tab.id)}/changesets${input.dryRun ? '?dryRun=1' : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ops,
            ...(input.documentTab !== undefined ? { documentTab: input.documentTab } : {}),
            ...(input.summary !== undefined ? { summary: input.summary } : {}),
            ...(input.base !== undefined ? { base: input.base } : {}),
          }),
        },
      );
      return {
        dryRun: answer.dryRun,
        changeset: answer.changeset && { id: answer.changeset.id, counts: answer.changeset.counts },
        results: answer.results,
      };
    } catch (error) {
      if (error instanceof ApiError) throw refusalOf(error);
      throw error;
    }
  },
  text: ({ dryRun, changeset, results }) => [
    ...results,
    dryRun
      ? 'dry run, nothing written'
      : changeset
        ? `~ text changeset ${changeset.id} · ${changeset.counts.added} added, ${changeset.counts.changed} changed · revert: livedoc changeset revert <doc> ${changeset.id}`
        : 'nothing changed',
  ],
  quiet: ({ changeset }) => (changeset ? [changeset.id] : []),
  cli: {
    positionals: ['doc', '...ops'],
    flags: { file: { short: 'f' } },
    examples: [
      `livedoc text edit "Launch plan" edit '"Q3"' '"Q4"' --summary "move the date"`,
      'livedoc text edit 3f9c -f ops.txt --dry-run',
    ],
    prints: 'a result line each operation, then the changeset',
  },
});

// `text-document download`: the CLI writes the file, so it runs it (apps/cli/src/commands/text-document-download.ts).
export const textDocumentDownload = defineVerb({
  id: 'text-document.download',
  summary: 'A text document as a file',
  description:
    "Writes a text document's file in its own format, or --format odt, fodt, docx, txt, md, html, epub or rtf, to --to or under its own name here.",
  behaviour: 'read',
  local: true,
  input: z.object({
    doc: docArg,
    tab: tabFlag,
    format: z
      .enum(TEXT_DOCUMENT_DOWNLOAD_FORMATS)
      .optional()
      .describe('odt, fodt, docx, txt, md, html, epub or rtf'),
    to: z.string().optional().describe('The file to write'),
  }),
  output: z.object({ lines: z.array(z.string()) }),
  text: ({ lines }) => lines,
  cli: {
    positionals: ['doc'],
    examples: [
      'livedoc text download "Launch plan"',
      'livedoc text download 3f9c --format md --to plan.md',
    ],
    prints: '<path>  <n> KB',
  },
});

// `text-document import`: the CLI reads the file, so it runs it (apps/cli/src/commands/text-document-import.ts).
export const textDocumentImport = defineVerb({
  id: 'text-document.import',
  summary: 'Open a file as a new text document',
  description:
    'Opens an .odt, .fodt, .ott, .docx, .dotx, .docm, .txt, .md, .html, .rtf file as a new text document, as File › Open does: in the format it is in (the others an ODF one), named after the file or --name. Prints its id, format and link.',
  behaviour: 'write',
  local: true,
  input: z.object({
    file: z.string().describe('The file to open'),
    name: z.string().optional().describe('The text document’s name; the file’s by default'),
  }),
  output: z.object({ lines: z.array(z.string()) }),
  text: ({ lines }) => lines,
  cli: {
    positionals: ['file'],
    examples: [
      'livedoc text import report.docx',
      'livedoc text import notes.md --name "Meeting notes"',
    ],
    prints: '+ text-document <ref> "<name>" · <format> · <link>',
  },
});

export const textDocumentVerbs: readonly Verb[] = [
  textDocumentView,
  textDocumentEdit,
  textDocumentDownload,
  textDocumentImport,
];

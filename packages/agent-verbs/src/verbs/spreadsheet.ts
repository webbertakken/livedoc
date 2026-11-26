// The spreadsheet verbs (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet"): `spreadsheet new`
// makes a spreadsheet document with its sheets named in order, the first optionally filled from a CSV file (or
// stdin), through the engine create_spreadsheet shares. Its sheets are then the sheet verbs' (`sheet set`, `sheet get`).
import { z } from 'zod';
import { defineVerb, VerbRefusal, type Verb } from '../define';
import { createSpreadsheet } from '../sheets/create-spreadsheet';

export const spreadsheetNew = defineVerb({
  id: 'spreadsheet.new',
  summary: 'Make a spreadsheet',
  description:
    'Makes a spreadsheet document (ODF), its sheets named in order (one, Sheet1, by default), the first filled from a CSV file or stdin from A1. Prints its id, name, sheets and link.',
  behaviour: 'write',
  input: z.object({
    name: z.string().min(1).describe('The spreadsheet\u2019s name'),
    sheets: z
      .array(z.string())
      .optional()
      .describe('Its sheets\u2019 names in order, the rest of the words'),
    csv: z.string().optional().describe('A CSV file to fill the first sheet from, or - for stdin'),
  }),
  output: z.object({
    documentId: z.string(),
    name: z.string(),
    sheets: z.array(
      z.object({ name: z.string(), sheetId: z.string(), filled: z.string().nullable() }),
    ),
    url: z.string(),
  }),
  run: async (ctx, input) => {
    const csv = input.csv !== undefined ? await ctx.readInput(input.csv) : undefined;
    const names = input.sheets?.length ? input.sheets : ['Sheet1'];
    const result = await createSpreadsheet(
      ctx.api,
      {
        name: input.name,
        sheets: names.map((name, i) => ({
          name,
          ...(i === 0 && csv !== undefined ? { csv } : {}),
        })),
      },
      'cli',
    );
    if (!result.ok)
      throw new VerbRefusal({
        status: 400,
        code: result.code,
        message: result.message,
        hint: 'name each sheet once: livedoc spreadsheet new "Budget" Costs Income',
      });
    if (result.refusal) ctx.notice(result.refusal.message);
    return {
      documentId: result.documentId,
      name: result.name,
      sheets: result.sheets.map(({ name, sheetId, filled }) => ({ name, sheetId, filled })),
      url: `${ctx.host}/document/${result.documentId}`,
    };
  },
  text: ({ documentId, name, sheets, url }) => [
    `+ spreadsheet ${documentId.slice(0, 8)} ${JSON.stringify(name)} · ${sheets.map((s) => `${s.name}${s.filled ? ` ${s.filled}` : ''}`).join(', ')} · ${url}`,
  ],
  quiet: ({ documentId }) => [documentId],
  cli: {
    positionals: ['name', '...sheets'],
    examples: [
      'livedoc spreadsheet new "Budget 2027" Costs Income',
      'cat models.csv | livedoc spreadsheet new "Model values" Models --csv -',
    ],
    prints: '+ spreadsheet <ref> "<name>" · <sheets> · <link>',
  },
});

export const spreadsheetVerbs: readonly Verb[] = [spreadsheetNew];

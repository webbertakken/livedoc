// The spreadsheet verbs (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet"): `spreadsheet new`
// makes a spreadsheet document with its sheets named in order, the first optionally filled from a CSV file (or
// stdin), through the engine create_spreadsheet shares. Its sheets are then the sheet verbs' (`sheet set`, `sheet get`).
import { z } from 'zod';
import { defineVerb, VerbRefusal, type Verb } from '../define';
import { WORKBOOK_FORMATS } from '@livedoc/sheets';
import { convertSpreadsheet } from '../sheets/convert-spreadsheet';
import { createSpreadsheet } from '../sheets/create-spreadsheet';
import { documentOf } from './shared';

// What a spreadsheet downloads as: its standards' formats, and one sheet's values as text.
export const DOWNLOAD_FORMATS = [...WORKBOOK_FORMATS, 'csv', 'tsv'] as const;

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

// `spreadsheet convert` (sheet-store.md "Built for agents in a spreadsheet", D271): the losses, then the conversion.
export const spreadsheetConvert = defineVerb({
  id: 'spreadsheet.convert',
  summary: "Change a spreadsheet's file format",
  description:
    'Converts a spreadsheet to ods, fods or xlsx: prints what a file of that format cannot hold, then converts. With --check it only prints them.',
  behaviour: 'write',
  input: z.object({
    doc: z.string().describe('A name, id prefix or LiveDoc URL'),
    to: z.enum(WORKBOOK_FORMATS).describe('The format: ods, fods or xlsx'),
    check: z.boolean().optional().describe('Only list what the new format cannot hold'),
  }),
  output: z.object({
    documentId: z.string(),
    from: z.string(),
    to: z.string(),
    converted: z.boolean(),
    losses: z.array(z.string()),
  }),
  run: async (ctx, { doc, to, check }) => {
    const document = await documentOf(ctx, doc);
    const result = await convertSpreadsheet(
      ctx.api,
      document.id,
      { to, check: check === true },
      'cli',
    );
    if (!result.ok)
      throw new VerbRefusal({
        status: result.code === 'workbook_not_found' ? 404 : 409,
        code: result.code,
        message: result.message,
        hint: 'check first with: livedoc spreadsheet convert <doc> <to> --check',
      });
    const { ok: _ok, ...converted } = result;
    return { documentId: document.id, ...converted };
  },
  text: ({ from, to, converted, losses }) => [
    converted
      ? `~ spreadsheet converted ${from} → ${to}`
      : `spreadsheet ${from} → ${to}, not converted`,
    ...losses,
  ],
  quiet: ({ documentId }) => [documentId],
  cli: {
    positionals: ['doc', 'to'],
    examples: [
      'livedoc spreadsheet convert "Budget 2027" xlsx --check',
      'livedoc spreadsheet convert 3f9c xlsx',
    ],
    prints: 'what was converted, then what the new format cannot hold, a line each',
  },
});

// `spreadsheet download` (D272): the CLI writes the file, so it runs it (apps/cli/src/commands/spreadsheet-download.ts).
export const spreadsheetDownload = defineVerb({
  id: 'spreadsheet.download',
  summary: 'A spreadsheet as a file',
  description:
    "Writes a spreadsheet's file in its own format, or --format ods, fods, xlsx, csv or tsv (csv and tsv: the sheet --sheet names, the first by default), to --to or under its own name here. Charts go with it.",
  behaviour: 'read',
  local: true,
  input: z.object({
    doc: z.string().describe('A name, id prefix or LiveDoc URL'),
    format: z.enum(DOWNLOAD_FORMATS).optional().describe('ods, fods, xlsx, csv or tsv'),
    sheet: z.string().optional().describe('csv and tsv: the sheet, by name'),
    to: z.string().optional().describe('The file to write'),
  }),
  output: z.object({ lines: z.array(z.string()) }),
  text: ({ lines }) => lines,
  cli: {
    positionals: ['doc'],
    examples: [
      'livedoc spreadsheet download "Budget 2027"',
      'livedoc spreadsheet download 3f9c --format csv --sheet Costs --to costs.csv',
    ],
    prints: '<path>  <n> KB',
  },
});

// `spreadsheet import` (D274): the CLI reads the file, so it runs it (apps/cli/src/commands/spreadsheet-import.ts).
export const spreadsheetImport = defineVerb({
  id: 'spreadsheet.import',
  summary: 'Open a file as a new spreadsheet',
  description:
    'Opens an .ods, .fods, .xlsx, .xlsm, .csv, .tsv or .txt file as a new spreadsheet, as File › Open does: in the format its bytes are in (csv and tsv one sheet of an ODF one), named after the file or --name. Prints its id, format, sheets and link, then what the file held that the spreadsheet does not.',
  behaviour: 'write',
  local: true,
  input: z.object({
    file: z.string().describe('The file to open'),
    name: z.string().optional().describe('The spreadsheet\u2019s name; the file\u2019s by default'),
  }),
  output: z.object({ lines: z.array(z.string()) }),
  text: ({ lines }) => lines,
  cli: {
    positionals: ['file'],
    examples: [
      'livedoc spreadsheet import budget.xlsx',
      'livedoc spreadsheet import models.csv --name "Model values"',
    ],
    prints:
      '+ spreadsheet <ref> "<name>" · <format> · <sheets> · <link>, then the import report a line each',
  },
});

export const spreadsheetVerbs: readonly Verb[] = [
  spreadsheetNew,
  spreadsheetImport,
  spreadsheetConvert,
  spreadsheetDownload,
];

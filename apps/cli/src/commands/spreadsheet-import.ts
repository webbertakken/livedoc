// `spreadsheet import` (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet", D274): a file from
// this computer opened as a new spreadsheet through the flow File › Open shares; its size checked before its bytes are
// read, as the editor checks a file's.
import {
  fileTooLarge,
  importSpreadsheet,
  SPREADSHEET_FILE_BYTES_MAX,
  VerbRefusal,
  type VerbContext,
} from '@livedoc/agent-verbs';
import type { CliIo } from '../io';

export type SpreadsheetImportInput = { file: string; name?: string };

export async function spreadsheetImport(
  io: CliIo,
  ctx: VerbContext,
  input: SpreadsheetImportInput,
): Promise<{ lines: string[] }> {
  const path = input.file.startsWith('/') ? input.file : `${io.cwd}/${input.file}`;
  const size = await io.files.size(path);
  if (size !== null && size > SPREADSHEET_FILE_BYTES_MAX)
    throw new VerbRefusal({
      status: 413,
      ...fileTooLarge(),
      hint: `a file of up to ${Math.floor(SPREADSHEET_FILE_BYTES_MAX / 1024 / 1024)} MB opens`,
    });
  const bytes = size === null ? null : await io.files.readBytes(path);
  if (!bytes)
    throw new VerbRefusal({
      status: 404,
      code: 'file_not_found',
      message: `No file ${input.file}.`,
      hint: 'give the path of an .ods, .fods, .xlsx, .csv or .tsv file',
    });
  const fileName = input.file.split('/').at(-1)!;
  const opened = await importSpreadsheet(
    ctx.api,
    { fileName, bytes, ...(input.name !== undefined ? { name: input.name } : {}) },
    'cli',
  );
  if (!opened.ok)
    throw new VerbRefusal({
      status: 400,
      code: opened.code,
      message: opened.message,
      hint: 'LiveDoc opens .ods, .fods, .xlsx, .xlsm, .csv, .tsv and .txt files',
    });
  ctx.log(`spreadsheet import ${opened.documentId} ${opened.imported} ${opened.cells} cells`);
  return {
    lines: [
      `+ spreadsheet ${opened.documentId.slice(0, 8)} ${JSON.stringify(opened.name)} · ${opened.format} · ${opened.sheets.map((s) => s.name).join(', ')} · ${ctx.host}/document/${opened.documentId}`,
      ...opened.report,
    ],
  };
}

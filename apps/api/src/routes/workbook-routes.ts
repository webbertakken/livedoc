// A spreadsheet's workbook doors (docs/specs/029-sheets/files-and-print.md, standard-mapping.md); its settings and its
// sheets' changes have their own (workbook-settings-route.ts, workbook-sheet-routes.ts):
//   GET /api/documents/<id>/workbook/file?format=ods|fods  the workbook as a file, written from the room's sheets
// with every value the engine works out cached beside its formula. A read, gated as the sheets are; a tab-scoped link
// is never offered on a sheet tab (spreadsheet.md "The workbook shape"), so one reaches no file. Answered inside the
// document's room.
import { WorkbookRecord, type WorkbookFormat } from '@livedoc/sheets';
import { writeWorkbook, type WrittenWorkbookFormat } from '@livedoc/sheets/files';
import { getDocumentMeta } from '../db';
import { readWorkbook } from '../db/workbook';
import { downloadFileName } from '@livedoc/office-packages';
import { CORS_HEADERS, forbidden, methodNotAllowed } from '../responses';
import type { DocumentRouteContext } from './context';
import { openWorkbook } from './sheet-page-routes';
import { sheetCaller, workbookRefused } from './sheet-route-kit';
import { saveSettings } from './workbook-settings-route';
import { allowImports, fetchImport } from './sheet-imports-route';
import { handleWorkbookSheetRoutes } from './workbook-sheet-routes';
import { loadSpreadsheetSheets } from './workbook-sheets-load';

const FILE_MEDIA_TYPES: Record<WorkbookFormat, string> = {
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  fods: 'application/vnd.oasis.opendocument.spreadsheet-flat-xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// Which standard each file is in: an ODF workbook leaves as either ODF form, never as another standard until a person
// converts it (fork C1).
const isOdf = (format: WorkbookFormat): format is WrittenWorkbookFormat =>
  format === 'ods' || format === 'fods';

/** A file name safe in a Content-Disposition header, from the document's name. */
export function workbookFileName(name: string, format: WorkbookFormat): string {
  return downloadFileName(name, format, UNTITLED_SPREADSHEET);
}

// What a spreadsheet with no name is called (spreadsheet.md "Making a spreadsheet").
const UNTITLED_SPREADSHEET = 'Untitled spreadsheet';

async function file(ctx: DocumentRouteContext, documentId: string): Promise<Response> {
  const started = Date.now();
  const caller = await sheetCaller(ctx, documentId, 'read');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  const record = await readWorkbook(ctx.env, documentId);
  if (!record) return workbookRefused('workbook_not_found', 404);
  const asked = ctx.url.searchParams.get('format') ?? record.format;
  if (!WorkbookRecord.isFormat(asked)) return workbookRefused('file_type_unknown', 400);
  // Conversion is a person's choice (files-and-print.md "Converting"), and the XLSX mapping is still ahead.
  if (!isOdf(asked) || !isOdf(record.format)) return workbookRefused('format_not_native', 409);
  const [meta, sheets] = await Promise.all([
    getDocumentMeta(ctx.env, documentId),
    loadSpreadsheetSheets(ctx.env, documentId),
  ]);
  const name = meta?.name ?? '';
  const written = writeWorkbook(sheets, record, name, asked);
  const body = written.data;
  console.info(
    `[workbook] file written document=${documentId} format=${asked} sheets=${sheets.length} bytes=${body.byteLength} losses=${written.losses.length} ms=${Date.now() - started}`,
  );
  return new Response(body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': 'no-cache',
      'Content-Type': FILE_MEDIA_TYPES[asked],
      'Content-Disposition': `attachment; filename="${workbookFileName(name, asked)}"`,
    },
  });
}

/** The workbook routes, or null for a path that is not theirs. */
export async function handleWorkbookRoutes(ctx: DocumentRouteContext): Promise<Response | null> {
  const { segments, request } = ctx;
  if (segments[3] !== 'workbook') return null;
  const documentId = segments[2]!;
  if (segments.length === 4)
    return request.method === 'GET' ? openWorkbook(ctx, documentId) : methodNotAllowed();
  if (segments.length === 5 && segments[4] === 'file')
    return request.method === 'GET' ? file(ctx, documentId) : methodNotAllowed();
  if (segments.length === 5 && segments[4] === 'settings')
    return request.method === 'PUT' ? saveSettings(ctx, documentId) : methodNotAllowed();
  // One word for both doors: each new word this deep multiplies the route-parity probe's sweep.
  if (segments.length === 5 && segments[4] === 'imports') {
    if (request.method === 'GET') return fetchImport(ctx, documentId);
    return request.method === 'POST' ? allowImports(ctx, documentId) : methodNotAllowed();
  }
  return handleWorkbookSheetRoutes(ctx);
}

// A spreadsheet's workbook doors (docs/specs/029-sheets/files-and-print.md, standard-mapping.md):
//   GET /api/documents/<id>/workbook/file?format=ods|fods  the workbook as a file, written from the room's sheets
// with every value the engine works out cached beside its formula. A read, gated as the sheets are; a tab-scoped link
// is never offered on a sheet tab (spreadsheet.md "The workbook shape"), so one reaches no file. Answered inside the
// document's room.
import { sheetFromJson, Workbook, WorkbookRecord, type WorkbookFormat } from '@livedoc/sheets';
import { workbookFileOf, writeFlatOds, writeOds } from '@livedoc/sheets/files';
import { getDocumentMeta, listSheets } from '../db';
import { documentTabOrder, readWorkbook } from '../db/workbook';
import { downloadFileName } from '../files/download-file-name';
import { CORS_HEADERS, forbidden, json, methodNotAllowed } from '../responses';
import type { DocumentRouteContext } from './context';
import { sheetCaller } from './sheet-route-kit';

const FILE_MEDIA_TYPES: Record<WorkbookFormat, string> = {
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  fods: 'application/vnd.oasis.opendocument.spreadsheet-flat-xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// Which standard each file is in: an ODF workbook leaves as either ODF form, never as another standard until a person
// converts it (fork C1).
const ODF: readonly WorkbookFormat[] = ['ods', 'fods'];

function refused(error: string, status: number): Response {
  console.info('[workbook] refused', { error });
  return json({ error }, { status });
}

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
  if (!record) return refused('workbook_not_found', 404);
  const asked = ctx.url.searchParams.get('format') ?? record.format;
  if (!WorkbookRecord.isFormat(asked)) return refused('file_type_unknown', 400);
  // Conversion is a person's choice (files-and-print.md "Converting"), and the XLSX mapping is still ahead.
  if (!ODF.includes(asked) || !ODF.includes(record.format))
    return refused('format_not_native', 409);
  const [meta, order, stored] = await Promise.all([
    getDocumentMeta(ctx.env, documentId),
    documentTabOrder(ctx.env, documentId),
    listSheets(ctx.env, documentId),
  ]);
  const at = new Map(order.map((id, i) => [id, i]));
  const sheets = stored
    .filter((s) => at.has(s.tabId))
    .sort((a, b) => at.get(a.tabId)! - at.get(b.tabId)!)
    .map(sheetFromJson);
  const engine = new Workbook({ sheets, locale: record.settings.locale });
  const name = meta?.name ?? '';
  const workbookFile = workbookFileOf(engine, sheets);
  const flat = asked === 'fods' ? writeFlatOds(workbookFile, name) : null;
  const written = flat
    ? { data: new TextEncoder().encode(flat.data), losses: flat.losses }
    : writeOds(workbookFile, name);
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
  if (segments.length === 5 && segments[4] === 'file')
    return request.method === 'GET' ? file(ctx, documentId) : methodNotAllowed();
  return null;
}

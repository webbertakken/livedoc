// A spreadsheet's conversion to the other standard (docs/specs/029-sheets/files-and-print.md "Converting"), one word
// for both doors:
//   GET  /api/documents/<id>/workbook/conversion?to=<format>  what a file in `to` cannot hold that the workbook's own
//        could, worked out from the room's sheets as a download is. Read access: a download in the other format lists
//        them too.
//   POST /api/documents/<id>/workbook/conversion { format }   the workbook's file format changed to `format`, of the
//        other standard, and sent live as a `workbook` op. Edit access.
// Never on a tab-scoped link. Answered inside the document's room.
import type {
  WorkbookConversionResponse,
  WorkbookRoomOp,
  WorkbookSettingsResponse,
} from '@livedoc/api-schema';
import { WorkbookRecord } from '@livedoc/sheets';
import { workbookConversion } from '@livedoc/sheets/files';
import { convertWorkbookFormat, readWorkbook } from '../db/workbook';
import { readKept } from '../db/workbook-kept';
import { forbidden, json } from '../responses';
import { relayWorkbook } from '../room-client';
import { readBody, type DocumentRouteContext } from './context';
import { sheetCaller, workbookRefused } from './sheet-route-kit';
import { loadSpreadsheetSheets } from './workbook-sheets-load';

export async function conversionLosses(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const started = Date.now();
  const caller = await sheetCaller(ctx, documentId, 'read');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  const record = await readWorkbook(ctx.env, documentId);
  if (!record) return workbookRefused('workbook_not_found', 404);
  const to = ctx.url.searchParams.get('to');
  if (!WorkbookRecord.isFormat(to)) return workbookRefused('file_type_unknown', 400);
  const same = WorkbookRecord.sameStandard(to, record.format);
  const [sheets, kept] = same
    ? [[], undefined]
    : await Promise.all([
        loadSpreadsheetSheets(ctx.env, documentId),
        readKept(ctx.env, documentId),
      ]);
  // The kept content a file of `to` leaves behind is listed (files-and-print.md "Converting", D109).
  const body: WorkbookConversionResponse = workbookConversion(sheets, record, to, kept);
  console.info(
    `[workbook] conversion listed document=${documentId} from=${record.format} to=${to} losses=${body.losses.map((l) => l.k).join(',') || 'none'} ms=${Date.now() - started}`,
  );
  return json(body);
}

export async function convert(ctx: DocumentRouteContext, documentId: string): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'edit');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  const record = await readWorkbook(ctx.env, documentId);
  if (!record) return workbookRefused('workbook_not_found', 404);
  const body = await readBody(ctx);
  const format = body instanceof Response ? undefined : body.format;
  if (!WorkbookRecord.isFormat(format)) return workbookRefused('file_type_unknown', 400);
  if (WorkbookRecord.sameStandard(format, record.format))
    return workbookRefused('format_same_standard', 409);
  const converted = await convertWorkbookFormat(ctx.env, documentId, format, Date.now());
  // Between the read and the write another Editor converted it (it is in that standard now), or it went.
  if (!converted)
    return (await readWorkbook(ctx.env, documentId))
      ? workbookRefused('format_same_standard', 409)
      : workbookRefused('workbook_not_found', 404);
  const op: WorkbookRoomOp = { kind: 'workbook', ...converted };
  ctx.waitUntil?.(relayWorkbook(ctx.env, documentId, op));
  console.info(
    `[workbook] converted document=${documentId} from=${record.format} to=${format} rev=${converted.rev}`,
  );
  const answer: WorkbookSettingsResponse = converted;
  return json(answer);
}

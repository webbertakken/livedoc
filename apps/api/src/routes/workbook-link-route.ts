// A sheet of this spreadsheet read by another document (docs/specs/029-sheets/plan-links.md "Reading a sheet from
// another document", D505):
//   GET /api/documents/<id>/workbook/link?sheet=<sheetId>&since=<version>
// Answered inside the room, with the reader's own access: the spreadsheet's name, the workbook's visible sheets, its locale and version, and
// the sheet as its values (linkedSheet), worked out by the engine as a range read is. Asked with the version the
// reader holds, an unchanged workbook answers so without working anything out. A document that is no spreadsheet and
// one the reader may not open are refused alike, so a link never tells which.
import type { WorkbookLinkResponse } from '@livedoc/api-schema';
import { linkedSheet, SheetLimits, Workbook } from '@livedoc/sheets';
import { getDocumentMeta } from '../db';
import { readWorkbook } from '../db/workbook';
import { json } from '../responses';
import type { DocumentRouteContext } from './context';
import { RANGE_SOURCE_CELLS_MAX } from './sheet-range-read';
import { sheetCaller, workbookRefused } from './sheet-route-kit';
import { loadSpreadsheetSheets, workbookCellCount, workbookVersion } from './workbook-sheets-load';

/** The characters of the version a link reads by: a SHA-256's hex, cut. Safe range 12 to 64. */
const LINK_VERSION_CHARS = 16;

async function versionOf(parts: readonly unknown[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, LINK_VERSION_CHARS);
}

export async function readWorkbookLink(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const started = Date.now();
  const refused = (reason: string) =>
    console.info(`[workbook] link refused document=${documentId} reason=${reason}`);
  const caller = await sheetCaller(ctx, documentId, 'read');
  if (caller instanceof Response || caller.scopeTab) {
    refused('permission');
    return workbookRefused('workbook_not_found', 404);
  }
  const record = await readWorkbook(ctx.env, documentId);
  if (!record) {
    refused('not_a_spreadsheet');
    return workbookRefused('workbook_not_found', 404);
  }
  const version = await versionOf([
    await workbookVersion(ctx.env, documentId),
    record.settings,
    record.meaning ?? null,
  ]);
  const sheetId = ctx.url.searchParams.get('sheet') ?? '';
  if (ctx.url.searchParams.get('since') === version) {
    console.info(`[workbook] link kept document=${documentId} sheet=${sheetId}`);
    return json({ unchanged: true, version } satisfies WorkbookLinkResponse);
  }
  if ((await workbookCellCount(ctx.env, documentId)) > RANGE_SOURCE_CELLS_MAX) {
    refused('too_large');
    return workbookRefused('link_too_large', 413);
  }
  const [sheets, meta] = await Promise.all([
    loadSpreadsheetSheets(ctx.env, documentId),
    getDocumentMeta(ctx.env, documentId),
  ]);
  const wb = new Workbook({
    sheets,
    locale: record.settings.locale,
    timeZone: record.settings.timeZone,
    ...(record.meaning ? { meaning: record.meaning } : {}),
    limits: SheetLimits.of(true),
    iteration: record.settings.iterate,
    // Nothing is fetched where no editor asks: an import reads as it does for the api's other readers (D65).
    imports: { access: 'allowed', web: false },
  });
  const sheet = sheetId ? linkedSheet(wb, sheetId) : null;
  console.info(
    `[workbook] link read document=${documentId} sheet=${sheetId} cells=${sheet?.cells.length ?? 0} ms=${Date.now() - started}`,
  );
  return json({
    version,
    name: meta?.name ?? '',
    locale: record.settings.locale,
    sheets: sheets.filter((s) => !s.layout.hidden).map((s) => ({ id: s.id, title: s.title })),
    sheet,
  } satisfies WorkbookLinkResponse);
}

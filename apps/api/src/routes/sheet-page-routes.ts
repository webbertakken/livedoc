// A spreadsheet opened by viewport (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Loading by viewport):
//   GET /api/documents/<id>/workbook?open=<tabId>&rows=0-<to>   the workbook row, every sheet's head and layout in tab
//       order, and the open sheet's cells of its first rows (WORKBOOK_FIRST_ROWS by default)
//   GET /api/documents/<id>/sheets/<sheetId>/cells?rows=<from>-<to>   one page of a sheet's cells, by row position
// Reads, gated as the sheets are. Answered inside the document's room.
import type { SheetCellsResponse, WorkbookResponse, WorkbookSheetDto } from '@livedoc/api-schema';
import { RowSpan, isSheetId } from '@livedoc/sheets';
import { listSheetHeads, readSheetHead, type SheetHead } from '../db';
import { readRowPage, rowPageJson } from '../db/sheet-pages';
import { headToJson } from '../db/sheets';
import { documentTabOrder, readWorkbook } from '../db/workbook';
import { forbidden, json } from '../responses';
import type { DocumentRouteContext } from './context';
import {
  sheetBusy,
  sheetCaller,
  sheetNotFound,
  sheetRejected,
  workbookRefused,
} from './sheet-route-kit';

// The rows asked, or the default when none are: null for a span that cannot be read.
function askedRows(ctx: DocumentRouteContext, fallback: RowSpan | null): RowSpan | null {
  const text = ctx.url.searchParams.get('rows');
  return text === null ? fallback : RowSpan.read(text);
}

// A sheet not opened: its head alone, whole when it holds no cell.
function headOnly(head: SheetHead): WorkbookSheetDto {
  return {
    ...headToJson(head, []),
    cellCount: head.cellCount,
    rowsLoaded: head.cellCount === 0 ? head.layout.rows.length : 0,
  };
}

export async function openWorkbook(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const started = Date.now();
  const caller = await sheetCaller(ctx, documentId, 'read');
  if (caller instanceof Response) return caller;
  // A tab-scoped link is never offered on a sheet tab (spreadsheet.md "The workbook shape").
  if (caller.scopeTab) return forbidden();
  const workbook = await readWorkbook(ctx.env, documentId);
  if (!workbook) return workbookRefused('workbook_not_found', 404);
  // The first rows: a prefix of the sheet, so what is loaded stays a prefix as pages follow.
  const rows = askedRows(ctx, RowSpan.first());
  if (!rows || rows.from !== 0) return sheetRejected('rows_invalid');
  const [order, heads] = await Promise.all([
    documentTabOrder(ctx.env, documentId),
    listSheetHeads(ctx.env, documentId),
  ]);
  const at = new Map(order.map((id, i) => [id, i]));
  const inOrder = heads
    .filter((h) => at.has(h.tabId))
    .sort((a, b) => at.get(a.tabId)! - at.get(b.tabId)!);
  const openTab = ctx.url.searchParams.get('open');
  const open = inOrder.find((h) => h.tabId === openTab) ?? inOrder[0];
  const sheets: WorkbookSheetDto[] = [];
  let cells = 0;
  for (const head of inOrder) {
    if (head !== open || head.cellCount === 0) {
      sheets.push(headOnly(head));
      continue;
    }
    const page = await readRowPage(ctx.env, documentId, head.id, rows, head);
    if (page === 'busy') return sheetBusy();
    if (!page) {
      sheets.push(headOnly(head));
      continue;
    }
    cells = page.cells.length;
    sheets.push({ ...rowPageJson(page), cellCount: page.head.cellCount, rowsLoaded: page.span.to });
  }
  console.info(
    `[workbook] opened document=${documentId} sheets=${sheets.length} rows=${rows.to} cells=${cells} ms=${Date.now() - started}`,
  );
  const body: WorkbookResponse = { workbook, sheets };
  return json(body);
}

export async function sheetCells(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
): Promise<Response> {
  const started = Date.now();
  const caller = await sheetCaller(ctx, documentId, 'read');
  if (caller instanceof Response) return caller;
  if (!isSheetId(sheetId)) return sheetNotFound();
  const rows = askedRows(ctx, null);
  if (!rows) return sheetRejected('rows_invalid');
  const head = await readSheetHead(ctx.env, documentId, sheetId);
  if (!head || (caller.scopeTab && head.tabId !== caller.scopeTab)) return sheetNotFound();
  const page = await readRowPage(ctx.env, documentId, sheetId, rows, head);
  if (page === 'busy') return sheetBusy();
  if (!page) return sheetNotFound();
  const body: SheetCellsResponse = {
    rev: page.head.rev,
    from: page.span.from,
    to: page.span.to,
    cells: rowPageJson(page).cells,
  };
  console.info(
    `[sheets] cells.page document=${documentId} from=${page.span.from} to=${page.span.to} cells=${body.cells.length} ms=${Date.now() - started}`,
  );
  return json(body);
}

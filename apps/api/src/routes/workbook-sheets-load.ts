// A spreadsheet's live sheets as the engine takes them (docs/specs/029-sheets/spreadsheet.md "The workbook shape"):
// the sheets of its tabs, in tab order, a deleted tab's sheet left out while it waits to expire. Read whole, for the
// file the room writes and the ranges another spreadsheet imports; and the facts that say whether it changed.
import { sheetFromJson, type Sheet } from '@livedoc/sheets';
import { listSheets } from '../db';
import { documentTabOrder } from '../db/workbook';
import type { DocumentEnv } from '../types';

export async function loadSpreadsheetSheets(
  env: DocumentEnv,
  documentId: string,
): Promise<Sheet[]> {
  const [order, stored] = await Promise.all([
    documentTabOrder(env, documentId),
    listSheets(env, documentId),
  ]);
  const at = new Map(order.map((id, i) => [id, i]));
  return stored
    .filter((s) => at.has(s.tabId))
    .sort((a, b) => at.get(a.tabId)! - at.get(b.tabId)!)
    .map(sheetFromJson);
}

/** The cells the spreadsheet's sheets hold, kept ones included: what loading it whole would read. */
export async function workbookCellCount(env: DocumentEnv, documentId: string): Promise<number> {
  const row = await env.DOCUMENT_DB.prepare(
    'SELECT COALESCE(SUM(cell_count), 0) AS n FROM sheets WHERE document_id = ?',
  )
    .bind(documentId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** What changes whenever anything a range read sees changes: each sheet's rev and title, and the tab order. */
export async function workbookVersion(env: DocumentEnv, documentId: string): Promise<string> {
  const [sheets, order] = await Promise.all([
    env.DOCUMENT_DB.prepare('SELECT id, rev FROM sheets WHERE document_id = ? ORDER BY id')
      .bind(documentId)
      .all<{ id: string; rev: number }>(),
    documentTabOrder(env, documentId),
  ]);
  const revs = (sheets.results ?? []).map((s) => `${s.id}:${s.rev}`).join(',');
  return `${revs}|${order.join(',')}`;
}

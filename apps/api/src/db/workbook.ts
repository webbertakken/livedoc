// The workbook row of a spreadsheet's room (docs/specs/029-sheets/sheet-store.md "In a spreadsheet"): its file format
// and settings. Present exactly when the document is a spreadsheet.
import { WorkbookRecord } from '@livedoc/sheets';
import type { DocumentEnv } from '../types';

export type WorkbookRow = { format: string; settings: string };

/** A workbook row as its record, or null when it cannot be read (logged). */
export function workbookFromRow(
  documentId: string,
  row: WorkbookRow | undefined,
): WorkbookRecord | null {
  if (!row) return null;
  let settings: unknown;
  try {
    settings = JSON.parse(row.settings);
  } catch {
    settings = null;
  }
  const record = WorkbookRecord.read({ format: row.format, settings });
  if (!record) console.warn('[workbook] unreadable row', { documentId });
  return record;
}

/** The document's workbook record, or null when it is no spreadsheet (or its row cannot be read, which is logged). */
export async function readWorkbook(
  env: DocumentEnv,
  documentId: string,
): Promise<WorkbookRecord | null> {
  const row = await env.DOCUMENT_DB.prepare(
    'SELECT format, settings FROM workbook WHERE document_id = ?',
  )
    .bind(documentId)
    .first<WorkbookRow>();
  return workbookFromRow(documentId, row ?? undefined);
}

export function insertWorkbookStatement(
  env: DocumentEnv,
  documentId: string,
  record: WorkbookRecord,
  now: number,
): D1PreparedStatement {
  return env.DOCUMENT_DB.prepare(
    `INSERT INTO workbook (document_id, format, settings, rev, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT (document_id) DO NOTHING`,
  ).bind(documentId, record.format, JSON.stringify(record.settings), now, now);
}

/** The document's tab ids in order: a spreadsheet's sheets in the order of its sheet bar. */
export async function documentTabOrder(env: DocumentEnv, documentId: string): Promise<string[]> {
  const rows = await env.DOCUMENT_DB.prepare(
    'SELECT tab_id FROM document_tabs WHERE document_id = ? ORDER BY order_index ASC',
  )
    .bind(documentId)
    .all<{ tab_id: string }>();
  return (rows.results ?? []).map((r) => r.tab_id);
}

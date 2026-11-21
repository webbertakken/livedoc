// The workbook row of a spreadsheet's room (docs/specs/029-sheets/sheet-store.md "In a spreadsheet"): its file format
// and settings. Present exactly when the document is a spreadsheet.
import { WorkbookRecord, type WorkbookSettings } from '@livedoc/sheets';
import type { DocumentEnv } from '../types';

export type WorkbookRow = { format: string; settings: string; imports_allowed?: number };

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
  const record = WorkbookRecord.read({
    format: row.format,
    settings,
    importsAllowed: row.imports_allowed === 1,
  });
  if (!record) console.warn('[workbook] unreadable row', { documentId });
  return record;
}

/** The document's workbook record, or null when it is no spreadsheet (or its row cannot be read, which is logged). */
export async function readWorkbook(
  env: DocumentEnv,
  documentId: string,
): Promise<WorkbookRecord | null> {
  const row = await env.DOCUMENT_DB.prepare(
    'SELECT format, settings, imports_allowed FROM workbook WHERE document_id = ?',
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

/** Whether the document is a spreadsheet: it has a workbook row (docs/specs/029-sheets/spreadsheet.md). */
export async function isSpreadsheet(env: DocumentEnv, documentId: string): Promise<boolean> {
  const row = await env.DOCUMENT_DB.prepare('SELECT 1 AS y FROM workbook WHERE document_id = ?')
    .bind(documentId)
    .first<{ y: number }>();
  return row !== null;
}

/** A spreadsheet's settings saved whole (sheet-store.md "Changing the workbook"): the row's new rev, or null for none. */
export async function saveWorkbookSettings(
  env: DocumentEnv,
  documentId: string,
  settings: WorkbookSettings,
  now: number,
): Promise<number | null> {
  const row = await env.DOCUMENT_DB.prepare(
    'UPDATE workbook SET settings = ?, rev = rev + 1, updated_at = ? WHERE document_id = ? RETURNING rev',
  )
    .bind(JSON.stringify(settings), now, documentId)
    .first<{ rev: number }>();
  return row?.rev ?? null;
}

/**
 * A spreadsheet's imports allowed, for good (imports.md "Allow access"): its record as it now stands and the row's new
 * rev, or null when the document is no spreadsheet.
 */
export async function allowWorkbookImports(
  env: DocumentEnv,
  documentId: string,
  now: number,
): Promise<{ workbook: WorkbookRecord; rev: number } | null> {
  const row = await env.DOCUMENT_DB.prepare(
    `UPDATE workbook SET imports_allowed = 1, rev = rev + 1, updated_at = ? WHERE document_id = ?
     RETURNING format, settings, imports_allowed, rev`,
  )
    .bind(now, documentId)
    .first<WorkbookRow & { rev: number }>();
  const workbook = workbookFromRow(documentId, row ?? undefined);
  return row && workbook ? { workbook, rev: row.rev } : null;
}

/**
 * Where a tab added after `after` goes in the document's order: just after it, or last when none is named. Null when
 * the tab named is not one of the document's.
 */
export async function tabPlaceAfter(
  env: DocumentEnv,
  documentId: string,
  after: string | undefined,
): Promise<number | null> {
  if (after === undefined) {
    const last = await env.DOCUMENT_DB.prepare(
      'SELECT MAX(order_index) AS at FROM document_tabs WHERE document_id = ?',
    )
      .bind(documentId)
      .first<{ at: number | null }>();
    return (last?.at ?? -1) + 1;
  }
  const row = await env.DOCUMENT_DB.prepare(
    'SELECT order_index AS at FROM document_tabs WHERE document_id = ? AND tab_id = ?',
  )
    .bind(documentId, after)
    .first<{ at: number }>();
  return row ? row.at + 1 : null;
}

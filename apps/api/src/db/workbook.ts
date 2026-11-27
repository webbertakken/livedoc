// The workbook row of a spreadsheet's room (docs/specs/029-sheets/sheet-store.md "In a spreadsheet"): its file format
// and settings. Present exactly when the document is a spreadsheet.
import {
  readNamedFunctions,
  WorkbookRecord,
  type NamedFunction,
  type WorkbookFormat,
  type WorkbookSettings,
} from '@livedoc/sheets';
import type { DocumentEnv } from '../types';

export type WorkbookRow = {
  format: string;
  settings: string;
  imports_allowed?: number;
  // The connected IMPORTRANGE sources as a JSON array, or null for none (formulas.md "Connecting two spreadsheets").
  range_sources?: string | null;
  // The file's meaning ('ooxml', 'openformula'), or null for Google's (formulas.md, the file's meaning; D101).
  meaning?: string | null;
  // The named functions as a JSON array, or null for none (formulas.md "Named functions").
  functions?: string | null;
};

/** The row's columns a record is read from. */
export const WORKBOOK_COLUMNS =
  'format, settings, imports_allowed, range_sources, meaning, functions';

function rangeSourcesOf(documentId: string, text: string | null | undefined): string[] | undefined {
  if (!text) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const sources = WorkbookRecord.readRangeSources(raw);
  if (!sources) console.warn('[workbook] unreadable range sources', { documentId });
  return sources ?? undefined;
}

// Named functions that do not read are dropped, as none, and logged: the rest of the workbook still opens.
function functionsOf(
  documentId: string,
  text: string | null | undefined,
): NamedFunction[] | undefined {
  if (!text) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const functions = readNamedFunctions(raw);
  if (!functions) console.warn('[workbook] functions unread', { documentId });
  return functions && functions.length > 0 ? functions : undefined;
}

// A meaning the record cannot read is Google's, as a spreadsheet's before its meaning was kept (D101), and logged.
function meaningOf(documentId: string, text: string | null | undefined): string | undefined {
  if (text === null || text === undefined) return undefined;
  if (text === 'ooxml' || text === 'openformula') return text;
  console.warn('[workbook] unreadable meaning', { documentId });
  return undefined;
}

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
  const rangeSources = rangeSourcesOf(documentId, row.range_sources);
  const meaning = meaningOf(documentId, row.meaning);
  const functions = functionsOf(documentId, row.functions);
  const record = WorkbookRecord.read({
    format: row.format,
    settings,
    importsAllowed: row.imports_allowed === 1,
    ...(rangeSources ? { rangeSources } : {}),
    ...(meaning ? { meaning } : {}),
    ...(functions ? { functions } : {}),
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
    `SELECT ${WORKBOOK_COLUMNS} FROM workbook WHERE document_id = ?`,
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
    `INSERT INTO workbook (document_id, format, settings, meaning, functions, rev, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT (document_id) DO NOTHING`,
  ).bind(
    documentId,
    record.format,
    JSON.stringify(record.settings),
    record.meaning ?? null,
    record.functions ? JSON.stringify(record.functions) : null,
    now,
    now,
  );
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

/** Each of the document's tabs at its place in `order` (every tab of the document, in its new order). */
export function tabOrderStatements(
  env: DocumentEnv,
  documentId: string,
  order: readonly string[],
): D1PreparedStatement[] {
  return order.map((tabId, at) =>
    env.DOCUMENT_DB.prepare(
      'UPDATE document_tabs SET order_index = ? WHERE document_id = ? AND tab_id = ?',
    ).bind(at, documentId, tabId),
  );
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
 * A spreadsheet's named functions saved whole (sheet-store.md "Changing the workbook", D303): its record as it now
 * stands and the row's new rev, or null when the document is no spreadsheet. None is saved as null.
 */
export async function saveWorkbookFunctions(
  env: DocumentEnv,
  documentId: string,
  functions: readonly NamedFunction[],
  now: number,
): Promise<{ workbook: WorkbookRecord; rev: number } | null> {
  const row = await env.DOCUMENT_DB.prepare(
    `UPDATE workbook SET functions = ?, rev = rev + 1, updated_at = ? WHERE document_id = ?
     RETURNING ${WORKBOOK_COLUMNS}, rev`,
  )
    .bind(functions.length > 0 ? JSON.stringify(functions) : null, now, documentId)
    .first<WorkbookRow & { rev: number }>();
  const workbook = workbookFromRow(documentId, row ?? undefined);
  return row && workbook ? { workbook, rev: row.rev } : null;
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
     RETURNING ${WORKBOOK_COLUMNS}, rev`,
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
  // Empty: first, as an undone delete of the first sheet goes back.
  if (after === '') return 0;
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

/**
 * Sources a spreadsheet's IMPORTRANGEs may read, added to those it had, for good (formulas.md "Connecting two
 * spreadsheets"): its record as it now stands and the row's new rev, or null when the document is no spreadsheet.
 * The union is worked out in the statement, so two Editors connecting at once both land.
 */
export async function connectWorkbookRangeSources(
  env: DocumentEnv,
  documentId: string,
  sources: readonly string[],
  now: number,
): Promise<{ workbook: WorkbookRecord; rev: number } | null> {
  const row = await env.DOCUMENT_DB.prepare(
    `UPDATE workbook
        SET range_sources = (
              SELECT json_group_array(value) FROM (
                SELECT value FROM json_each(COALESCE(range_sources, '[]'))
                UNION SELECT value FROM json_each(?)
              )
            ),
            rev = rev + 1, updated_at = ?
      WHERE document_id = ?
      RETURNING ${WORKBOOK_COLUMNS}, rev`,
  )
    .bind(JSON.stringify(sources), now, documentId)
    .first<WorkbookRow & { rev: number }>();
  const workbook = workbookFromRow(documentId, row ?? undefined);
  return row && workbook ? { workbook, rev: row.rev } : null;
}

/**
 * A spreadsheet converted to `format` (files-and-print.md "Converting"): one statement, landing only while the workbook
 * is still of the other standard, so two Editors converting at once convert it once. A file's meaning becomes the new
 * format's; Google's stays (D100). Its record as it now stands and
 * the row's new rev, or null when it is no spreadsheet or already in that standard.
 */
export async function convertWorkbookFormat(
  env: DocumentEnv,
  documentId: string,
  format: WorkbookFormat,
  now: number,
): Promise<{ workbook: WorkbookRecord; rev: number } | null> {
  const row = await env.DOCUMENT_DB.prepare(
    `UPDATE workbook
        SET format = ?, meaning = CASE WHEN meaning IS NULL THEN NULL ELSE ? END, rev = rev + 1, updated_at = ?
      WHERE document_id = ? AND (format = 'xlsx') <> (? = 'xlsx')
      RETURNING ${WORKBOOK_COLUMNS}, rev`,
  )
    .bind(format, WorkbookRecord.meaningOf(format), now, documentId, format)
    .first<WorkbookRow & { rev: number }>();
  const workbook = workbookFromRow(documentId, row ?? undefined);
  return row && workbook ? { workbook, rev: row.rev } : null;
}

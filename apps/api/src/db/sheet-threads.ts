// A spreadsheet's comment threads as the room's SQLite keeps them (docs/specs/029-sheets/review.md "Comments"):
// `sheet_threads`, a row a thread, its comments one JSON list. Read whole for a workbook (or a tab's sheets), one at a
// time for a write, which is guarded by the thread's `v` so two writers never lose one another's op.
import type { OfficeComment, SheetThread } from '@livedoc/document';
import type { DocumentEnv } from '../types';

type ThreadRow = {
  sheet_id: string;
  id: string;
  r1: string;
  c1: string;
  r2: string;
  c2: string;
  resolved: number;
  comments: string;
  v: number;
};

const COLUMNS = 'sheet_id, id, r1, c1, r2, c2, resolved, comments, v';

function threadOf(row: ThreadRow): SheetThread {
  let comments: OfficeComment[] = [];
  try {
    const parsed: unknown = JSON.parse(row.comments);
    if (Array.isArray(parsed)) comments = parsed as OfficeComment[];
  } catch {
    console.warn('[sheets] thread comments unreadable', { thread: row.id });
  }
  return {
    id: row.id,
    sheetId: row.sheet_id,
    anchor: { r1: row.r1, c1: row.c1, r2: row.r2, c2: row.c2 },
    resolved: row.resolved === 1,
    comments,
    v: row.v,
  };
}

/** Every thread of the document's sheets, or of one tab's (a tab-scoped caller's), sheet by sheet. */
export async function readWorkbookThreads(
  env: DocumentEnv,
  documentId: string,
  tabId: string | null,
): Promise<SheetThread[]> {
  const rows = await (
    tabId === null
      ? env.DOCUMENT_DB.prepare(
          `SELECT ${COLUMNS} FROM sheet_threads WHERE document_id = ? ORDER BY sheet_id, id`,
        ).bind(documentId)
      : env.DOCUMENT_DB.prepare(
          `SELECT t.sheet_id, t.id, t.r1, t.c1, t.r2, t.c2, t.resolved, t.comments, t.v
             FROM sheet_threads t JOIN sheets s ON s.document_id = t.document_id AND s.id = t.sheet_id
            WHERE t.document_id = ? AND s.tab_id = ? ORDER BY t.sheet_id, t.id`,
        ).bind(documentId, tabId)
  ).all<ThreadRow>();
  return rows.results.map(threadOf);
}

/** The threads of a set of sheets (a tab's, for the collaboration index). */
export async function readSheetsThreads(
  env: DocumentEnv,
  documentId: string,
  sheetIds: readonly string[],
): Promise<SheetThread[]> {
  const rows = await env.DOCUMENT_DB.prepare(
    `SELECT ${COLUMNS} FROM sheet_threads
      WHERE document_id = ? AND sheet_id IN (SELECT value FROM json_each(?)) ORDER BY sheet_id, id`,
  )
    .bind(documentId, JSON.stringify(sheetIds))
    .all<ThreadRow>();
  return rows.results.map(threadOf);
}

/** One thread and how many its sheet holds. */
export async function readThreadAt(
  env: DocumentEnv,
  documentId: string,
  sheetId: string,
  id: string,
): Promise<{ thread: SheetThread | null; count: number }> {
  const [row, count] = await Promise.all([
    env.DOCUMENT_DB.prepare(
      `SELECT ${COLUMNS} FROM sheet_threads WHERE document_id = ? AND sheet_id = ? AND id = ?`,
    )
      .bind(documentId, sheetId, id)
      .first<ThreadRow>(),
    env.DOCUMENT_DB.prepare(
      'SELECT COUNT(*) AS n FROM sheet_threads WHERE document_id = ? AND sheet_id = ?',
    )
      .bind(documentId, sheetId)
      .first<{ n: number }>(),
  ]);
  return { thread: row ? threadOf(row) : null, count: count!.n };
}

/**
 * Stores a thread's state after an op, or removes it (`next` null), only while the stored one is still at `was`'s
 * `v` (none for a start): true when stored, false when someone else's op came first.
 */
export async function storeThread(
  env: DocumentEnv,
  documentId: string,
  sheetId: string,
  was: SheetThread | null,
  id: string,
  next: SheetThread | null,
  now: number,
): Promise<boolean> {
  const db = env.DOCUMENT_DB;
  if (next === null) {
    const res = await db
      .prepare(
        'DELETE FROM sheet_threads WHERE document_id = ? AND sheet_id = ? AND id = ? AND v = ?',
      )
      .bind(documentId, sheetId, id, was!.v)
      .run();
    return res.meta.changes > 0;
  }
  const { anchor } = next;
  const values = [
    anchor.r1,
    anchor.c1,
    anchor.r2,
    anchor.c2,
    next.resolved ? 1 : 0,
    JSON.stringify(next.comments),
    next.v,
    now,
  ];
  const res = was
    ? await db
        .prepare(
          `UPDATE sheet_threads SET r1 = ?, c1 = ?, r2 = ?, c2 = ?, resolved = ?, comments = ?, v = ?, updated_at = ?
            WHERE document_id = ? AND sheet_id = ? AND id = ? AND v = ?`,
        )
        .bind(...values, documentId, sheetId, id, was.v)
        .run()
    : await db
        .prepare(
          `INSERT OR IGNORE INTO sheet_threads
             (r1, c1, r2, c2, resolved, comments, v, updated_at, document_id, sheet_id, id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(...values, documentId, sheetId, id)
        .run();
  return res.meta.changes > 0;
}

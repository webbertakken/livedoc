// A sheet's head as a cell write needs it (docs/specs/029-sheets/performance.md "Held in memory"): its columns whole,
// and of its rows only the ones the write names, the rows its validation rules and protections start and end on, and
// its first row,
// in their true order. A cell write asks the order only whether a row still exists and how rows lie against one
// another (a rule's range covering a cell), and an order-preserving subset answers both as the whole order does; the
// first row keeps the sheet holding a cell, as the engine requires. So a cell write on a sheet of a million rows
// never parses a million ids into the room's memory: SQLite finds the few it needs in the stored chunks.
import type { SheetWrite } from '@livedoc/sheets';
import type { DocumentEnv } from '../types';
import { readSheetHead, type SheetHead } from './sheets';

// Up to this many rows are found by a text search of each chunk, one search a row (about 15 ms a row at a million
// rows); more by one scan of every chunk's ids (40 to 100 ms whatever their number). Measured in node:sqlite. 1 to 8.
export const ROWS_SEARCHED_MAX = 3;

type Found = { id: string };

/** The head a cell write runs against; a sheet whose order is still in its layout is read whole. Null: no sheet. */
export async function readCellWriteHead(
  env: DocumentEnv,
  documentId: string,
  sheetId: string,
  write: Extract<SheetWrite, { kind: 'cells' }>,
): Promise<SheetHead | null> {
  // The first row: the text between the first chunk's opening `["` and the quote closing its first id.
  const first = await env.DOCUMENT_DB.prepare(
    `SELECT substr(ids, 3, instr(substr(ids, 3), '"') - 1) AS id FROM sheet_axes
      WHERE document_id = ?1 AND sheet_id = ?2 AND axis = 'r' AND ids <> '[]'
      ORDER BY chunk LIMIT 1`,
  )
    .bind(documentId, sheetId)
    .first<Found>();
  if (!first) return readSheetHead(env, documentId, sheetId);
  const head = await readSheetHead(env, documentId, sheetId, { columnsOnly: true });
  if (!head) return null;
  const wanted = new Set<string>([first.id]);
  for (const ch of Array.isArray(write.cells) ? write.cells : [])
    if (typeof ch?.r === 'string') wanted.add(ch.r);
  for (const rule of head.layout.rules ?? []) {
    wanted.add(rule.r1);
    wanted.add(rule.r2);
  }
  // And every protection's rows, so a cell is known inside one or not (data-tools.md "Protected ranges").
  for (const p of head.layout.protections ?? [])
    for (const range of [...(p.range ? [p.range] : []), ...(p.except ?? [])]) {
      wanted.add(range.r1);
      wanted.add(range.r2);
    }
  const rows = await rowsInOrder(env, documentId, sheetId, [...wanted]);
  return { ...head, layout: { ...head.layout, rows } };
}

// Which of `ids` the sheet's rows hold, in the sheet's order.
async function rowsInOrder(
  env: DocumentEnv,
  documentId: string,
  sheetId: string,
  ids: readonly string[],
): Promise<string[]> {
  // An id is a quoted element of its chunk's JSON, so a search for it in quotes finds it and nothing else.
  const query =
    ids.length <= ROWS_SEARCHED_MAX
      ? `SELECT w.value AS id FROM json_each(?3) w, sheet_axes a
          WHERE a.document_id = ?1 AND a.sheet_id = ?2 AND a.axis = 'r'
            AND instr(a.ids, '"' || w.value || '"') > 0
          ORDER BY a.chunk, instr(a.ids, '"' || w.value || '"')`
      : `SELECT j.value AS id FROM sheet_axes a, json_each(a.ids) j
          WHERE a.document_id = ?1 AND a.sheet_id = ?2 AND a.axis = 'r'
            AND j.value IN (SELECT value FROM json_each(?3))
          ORDER BY a.chunk, j.key`;
  const found = await env.DOCUMENT_DB.prepare(query)
    .bind(documentId, sheetId, JSON.stringify(ids))
    .all<Found>();
  return found.results.map((r) => r.id);
}

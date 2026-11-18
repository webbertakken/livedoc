// A spreadsheet's styles (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", formatting.md "Styles in the model"):
// each distinct cell format once in `sheet_styles`, by id (`s1`, `s2`, ...), a cell holding its style's id. A format
// lands in `sheet_cells.format` as a Plan Sheet's always has (a write's patch merged in SQL, a create's, a copy's);
// in a spreadsheet the statements below then move it into its style in the same batch, so `format` is empty at rest.
// Reads answer the format again (CELL_FORMAT), so the wire and the editor carry formats as before.
import type { DocumentEnv } from '../types';

/** A cell's format, from its own column or its style: `c` is the `sheet_cells` row's alias. */
export function cellFormatSql(c: string): string {
  return `COALESCE(${c}.format, (SELECT s.keys FROM sheet_styles s WHERE s.document_id = ${c}.document_id AND s.id = ${c}.style_id))`;
}

// A format's canonical text: its keys in order, as CellStyle.keyOf writes it (`@livedoc/sheets`), so a format sent in
// any order finds its style. JSON booleans come out of json_each as 1 and 0, and objects as text, so each is put back.
function canonicalSql(format: string): string {
  return `(SELECT json_group_object(key, CASE type WHEN 'true' THEN json('true') WHEN 'false' THEN json('false')
                                       WHEN 'object' THEN json(value) WHEN 'array' THEN json(value) ELSE value END
                                   ORDER BY key)
             FROM json_each(${format}))`;
}

// The statements run in a spreadsheet only, and when given a write's nonce only if that write landed (db/sheets.ts).
const IN_SPREADSHEET = `EXISTS (SELECT 1 FROM workbook WHERE document_id = ?1)`;
const LANDED = `(?3 IS NULL OR EXISTS (SELECT 1 FROM sheets WHERE document_id = ?1 AND id = ?2 AND write_nonce = ?3))`;
// The cells holding a format not yet moved into a style: one sheet's, or the document's when the sheet is null.
const UNSTYLED = `c.document_id = ?1 AND (?2 IS NULL OR c.sheet_id = ?2) AND c.format IS NOT NULL`;

/**
 * Move the formats of a sheet's cells (or of every sheet when `sheetId` is null) into styles: new styles first, with
 * the next ids in the order their cells were written, then each cell's style id, its format column emptied. A format
 * of no keys holds no style. Outside a spreadsheet they change nothing.
 */
export function styleCellsStatements(
  env: DocumentEnv,
  documentId: string,
  sheetId: string | null,
  nonce: string | null = null,
): D1PreparedStatement[] {
  return [
    env.DOCUMENT_DB.prepare(
      `INSERT INTO sheet_styles (document_id, id, keys)
       SELECT ?1, 's' || (base.n + ROW_NUMBER() OVER (ORDER BY fresh.first)), fresh.keys
         FROM (SELECT ${canonicalSql('c.format')} AS keys, MIN(c.rowid) AS first
                 FROM sheet_cells c WHERE ${UNSTYLED} GROUP BY keys) fresh,
              (SELECT COALESCE(MAX(CAST(substr(id, 2) AS INTEGER)), 0) AS n
                 FROM sheet_styles WHERE document_id = ?1) base
        WHERE fresh.keys <> '{}'
          AND NOT EXISTS (SELECT 1 FROM sheet_styles s WHERE s.document_id = ?1 AND s.keys = fresh.keys)
          AND ${IN_SPREADSHEET} AND ${LANDED}`,
    ).bind(documentId, sheetId, nonce),
    env.DOCUMENT_DB.prepare(
      `UPDATE sheet_cells AS c
          SET style_id = (SELECT s.id FROM sheet_styles s
                           WHERE s.document_id = ?1 AND s.keys = ${canonicalSql('c.format')}),
              format = NULL
        WHERE ${UNSTYLED} AND ${IN_SPREADSHEET} AND ${LANDED}`,
    ).bind(documentId, sheetId, nonce),
  ];
}

// Every sheet's grid in a workbook (docs/specs/029-sheets/spreadsheet.md "Limits"): its rows and columns, counted in
// SQL from the chunks its order is stored in (./sheet-axes), or from its layout for a sheet stored before them, so a
// check of the workbook's limits never reads a million row ids into the room's memory. Only the sheets on a tab the
// document holds count: a deleted tab's sheet only waits to expire.
import type { GridSize } from '@livedoc/sheets';
import type { DocumentEnv } from '../types';

export type SheetGrid = GridSize & { readonly id: string };

const COUNT = (axis: 'r' | 'c', key: 'rows' | 'cols') =>
  `COALESCE(
     (SELECT SUM(json_array_length(a.ids)) FROM sheet_axes a
       WHERE a.document_id = s.document_id AND a.sheet_id = s.id AND a.axis = '${axis}'),
     json_array_length(s.layout, '$.${key}'),
     0)`;

export async function workbookGrids(env: DocumentEnv, documentId: string): Promise<SheetGrid[]> {
  const rows = await env.DOCUMENT_DB.prepare(
    `SELECT s.id, ${COUNT('r', 'rows')} AS rows, ${COUNT('c', 'cols')} AS cols
       FROM sheets s JOIN document_tabs dt ON dt.document_id = s.document_id AND dt.tab_id = s.tab_id
      WHERE s.document_id = ?`,
  )
    .bind(documentId)
    .all<{ id: string; rows: number; cols: number }>();
  return (rows.results ?? []).map((r) => ({ id: r.id, rows: r.rows, cols: r.cols }));
}

/** The grids with one sheet's as it would be (`sheet` added when not among them). */
export function gridsWith(grids: readonly SheetGrid[], sheet: SheetGrid): SheetGrid[] {
  const out = grids.filter((g) => g.id !== sheet.id);
  out.push(sheet);
  return out;
}

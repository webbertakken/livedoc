// A sheet's row and column order, in chunks of `sheet_axes` (docs/specs/029-sheets/sheet-store.md "In a spreadsheet",
// Layout; AxisChunks in @livedoc/sheets). The layout JSON in `sheets` holds everything else. A sheet stored before
// the chunks, or moved in from an older store, still reads its order from its layout; its next layout write moves it.
import { AxisChunks, type AxisChunk, type SheetLayout } from '@livedoc/sheets';
import type { DocumentEnv } from '../types';

export type Axis = 'r' | 'c';

/** A sheet's stored chunks, by axis: what a layout write plans against. */
export type SheetAxes = { readonly r: readonly AxisChunk[]; readonly c: readonly AxisChunk[] };

export const NO_AXES: SheetAxes = { r: [], c: [] };

type AxisRow = { sheet_id: string; axis: Axis; chunk: number; ids: string };

function parseIds(text: string): string[] {
  try {
    const ids: unknown = JSON.parse(text);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    console.error('[sheets] axes.unreadable', { length: text.length });
    return [];
  }
}

/** The chunks of the named sheets (of one axis, when named); a sheet with none is absent. */
export async function readAxes(
  env: DocumentEnv,
  documentId: string,
  sheetIds: readonly string[],
  only?: Axis,
): Promise<Map<string, SheetAxes>> {
  const rows = await env.DOCUMENT_DB.prepare(
    `SELECT sheet_id, axis, chunk, ids FROM sheet_axes
      WHERE document_id = ?1 AND sheet_id IN (SELECT value FROM json_each(?2)) AND (?3 IS NULL OR axis = ?3)
      ORDER BY sheet_id, axis, chunk`,
  )
    .bind(documentId, JSON.stringify(sheetIds), only ?? null)
    .all<AxisRow>();
  const out = new Map<string, { r: AxisChunk[]; c: AxisChunk[] }>();
  for (const row of rows.results ?? []) {
    let axes = out.get(row.sheet_id);
    if (!axes) out.set(row.sheet_id, (axes = { r: [], c: [] }));
    axes[row.axis].push({ key: row.chunk, ids: parseIds(row.ids) });
  }
  return out;
}

/** The layout as a sheet holds it: its order from its chunks, or from the layout itself where it has none yet. */
export function layoutWithAxes(stored: SheetLayout, axes: SheetAxes): SheetLayout {
  return {
    ...stored,
    rows: axes.r.length > 0 ? AxisChunks.join(axes.r) : (stored.rows ?? []),
    cols: axes.c.length > 0 ? AxisChunks.join(axes.c) : (stored.cols ?? []),
  };
}

/** The layout JSON as stored: everything but the order. */
export function layoutWithoutAxes(layout: SheetLayout): string {
  const { rows: _rows, cols: _cols, ...rest } = layout;
  return JSON.stringify(rest);
}

/**
 * The statements that store `layout`'s order over the chunks a sheet held (`before`): only the chunks that changed,
 * each a statement of its own (a chunk is up to about 900 KB). With a nonce they run only if that write landed.
 */
export function axisWriteStatements(
  env: DocumentEnv,
  documentId: string,
  sheetId: string,
  before: SheetAxes,
  layout: SheetLayout,
  nonce: string | null = null,
): D1PreparedStatement[] {
  const landed = `(?3 IS NULL OR EXISTS (SELECT 1 FROM sheets WHERE document_id = ?1 AND id = ?2 AND write_nonce = ?3))`;
  const out: D1PreparedStatement[] = [];
  for (const axis of ['r', 'c'] as const) {
    const plan = AxisChunks.plan(before[axis], axis === 'r' ? layout.rows : layout.cols);
    if (plan.drop.length > 0)
      out.push(
        env.DOCUMENT_DB.prepare(
          `DELETE FROM sheet_axes WHERE document_id = ?1 AND sheet_id = ?2 AND axis = ?4
              AND chunk IN (SELECT value FROM json_each(?5)) AND ${landed}`,
        ).bind(documentId, sheetId, nonce, axis, JSON.stringify(plan.drop)),
      );
    for (const chunk of plan.put)
      out.push(
        env.DOCUMENT_DB.prepare(
          `INSERT INTO sheet_axes (document_id, sheet_id, axis, chunk, ids)
           SELECT ?1, ?2, ?4, ?5, ?6 WHERE ${landed}
           ON CONFLICT (document_id, sheet_id, axis, chunk) DO UPDATE SET ids = excluded.ids`,
        ).bind(documentId, sheetId, nonce, axis, chunk.key, JSON.stringify(chunk.ids)),
      );
  }
  return out;
}

/** A copy of one sheet's chunks under another sheet id of the same document. */
export function copyAxesStatement(
  env: DocumentEnv,
  documentId: string,
  fromId: string,
  toId: string,
): D1PreparedStatement {
  return env.DOCUMENT_DB.prepare(
    `INSERT INTO sheet_axes (document_id, sheet_id, axis, chunk, ids)
     SELECT document_id, ?3, axis, chunk, ids FROM sheet_axes WHERE document_id = ?1 AND sheet_id = ?2`,
  ).bind(documentId, fromId, toId);
}

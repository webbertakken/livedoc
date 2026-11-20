// The Sheets migration's dry-run sweep (docs/specs/029-sheets/migration.md "How it runs"): off unless the Worker
// variable `SHEETS_MIGRATION` is `dry`. Then each minute it asks up to SHEET_DRY_BATCH rooms of documents not planned
// yet (or whose try failed an hour ago) what they would become, and writes each answer to D1 as counts for the
// operator's read-only script. It never changes a document; the run itself is Phase 16's (plan 0020).
import type { Env } from '../types';
import { documentRoom } from '../document-room/document-client';
import type { SheetMigrationDry } from './sheet-migration-dry';

/** The switch: absent or anything else is off. `run` is reserved for the migration itself (Phase 16). */
export const SHEETS_MIGRATION_DRY = 'dry';
/** Documents one sweep run plans. */
export const SHEET_DRY_BATCH = 25;
/** Plans in flight at once: Workers' open connections. */
export const SHEET_DRY_CONCURRENCY = 6;
/** A failed plan is tried again at most once an hour. */
export const SHEET_DRY_RETRY_MS = 3_600_000;

export type SheetDrySweep = { found: number; planned: number; failed: number };

type SweepEnv = Pick<Env, 'DB' | 'DOCUMENT_ROOM' | 'SHEETS_MIGRATION'>;

function planStatement(
  env: SweepEnv,
  documentId: string,
  dry: SheetMigrationDry | { error: string },
  now: number,
): D1PreparedStatement {
  const ok = 'kind' in dry;
  const c = ok ? dry.counts : null;
  return env.DB.prepare(
    `INSERT INTO sheet_migration_plans
       (document_id, kind, tabs, sheets, cells, card_tables, charts, tabs_removed, sheets_left, planned_at, error)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
     ON CONFLICT (document_id) DO UPDATE SET kind = excluded.kind, tabs = excluded.tabs, sheets = excluded.sheets,
       cells = excluded.cells, card_tables = excluded.card_tables, charts = excluded.charts,
       tabs_removed = excluded.tabs_removed, sheets_left = excluded.sheets_left, planned_at = excluded.planned_at,
       error = excluded.error`,
  ).bind(
    documentId,
    ok ? dry.kind : 'failed',
    c?.tabs ?? 0,
    c?.sheets ?? 0,
    c?.cells ?? 0,
    c?.cardTables ?? 0,
    c?.charts ?? 0,
    ok ? dry.tabsRemoved : 0,
    ok ? dry.sheetsLeft : 0,
    now,
    ok ? null : dry.error,
  );
}

export async function sweepSheetMigrationDry(env: SweepEnv, now: number): Promise<SheetDrySweep> {
  if (env.SHEETS_MIGRATION !== SHEETS_MIGRATION_DRY) return { found: 0, planned: 0, failed: 0 };
  const due = await env.DB.prepare(
    `SELECT d.id, d.name FROM documents d LEFT JOIN sheet_migration_plans p ON p.document_id = d.id
      WHERE p.document_id IS NULL OR (p.kind = 'failed' AND p.planned_at < ?1)
      ORDER BY p.document_id IS NOT NULL, d.created_at
      LIMIT ?2`,
  )
    .bind(now - SHEET_DRY_RETRY_MS, SHEET_DRY_BATCH)
    .all<{ id: string; name: string }>();
  const docs = due.results ?? [];
  if (docs.length === 0) return { found: 0, planned: 0, failed: 0 };
  const writes: D1PreparedStatement[] = [];
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < docs.length) {
      const { id, name } = docs[next++]!;
      try {
        const dry = await documentRoom(env, id).sheetMigrationDry(name);
        console.info(
          `[sheets-migrate] dry ${id} kind=${dry.kind} tabs=${dry.counts.tabs} sheets=${dry.counts.sheets} cells=${dry.counts.cells}`,
        );
        writes.push(planStatement(env, id, dry, now));
      } catch (error) {
        const reason = error instanceof Error ? error.name : typeof error;
        console.error(`[sheets-migrate] failed ${id} ${reason}`, error);
        failed++;
        writes.push(planStatement(env, id, { error: reason }, now));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SHEET_DRY_CONCURRENCY, docs.length) }, worker));
  await env.DB.batch(writes);
  const result = { found: docs.length, planned: docs.length - failed, failed };
  console.log(
    `[sheets-migrate] dry sweep found=${result.found} planned=${result.planned} failed=${result.failed}`,
  );
  return result;
}

// A room's own upkeep (docs/specs/006-document/document-storage.md "Upkeep"), run from its alarm
// at most once per UPKEEP_INTERVAL_MS: agent changesets past their retention go (their parts by the cascade), and
// sheets no tab has referenced for SHEET_UNREFERENCED_DAYS (sheet-sweep.ts). It answers when the next run is due:
// the moment the oldest thing left would age out, never sooner than a day, or none when nothing is left to age, so
// an idle room is not woken for nothing.

import { CHANGESET_RETENTION_MS } from '@livedoc/api-schema';
import { DAY_MS } from '@livedoc/items';
import { deleteOldChangesets } from '../db/changesets';
import { runSheetExpiry, SHEET_UNREFERENCED_DAYS } from '../sheet-sweep';
import type { DocumentEnv } from '../types';

export const UPKEEP_INTERVAL_MS = DAY_MS;

// The room's key-value record of its last upkeep run.
export const UPKEEP_AT_KEY = 'upkeep-at';
// The room's key-value record of its next upkeep, so a room evicted meanwhile still runs it when its alarm fires.
export const UPKEEP_DUE_KEY = 'upkeep-due';

export type UpkeepOutcome = { changesets: number; sheets: number; nextAt: number | null };

export async function maintainRoom(
  env: DocumentEnv,
  documentId: string,
  now: number,
): Promise<UpkeepOutcome> {
  const changesets = await deleteOldChangesets(env, now - CHANGESET_RETENTION_MS);
  const expired = await runSheetExpiry(env, now);
  const oldest = await env.DOCUMENT_DB.prepare(
    `SELECT (SELECT MIN(created_at) FROM agent_changesets) AS changeset,
            (SELECT MIN(unreferenced_since) FROM sheets WHERE unreferenced_since IS NOT NULL) AS sheet`,
  ).first<{ changeset: number | null; sheet: number | null }>();
  // Each cutoff is strict (older than), so the oldest ages out a millisecond past its period.
  const due: number[] = [];
  if (oldest?.changeset != null) due.push(oldest.changeset + CHANGESET_RETENTION_MS + 1);
  if (oldest?.sheet != null) due.push(oldest.sheet + SHEET_UNREFERENCED_DAYS * DAY_MS + 1);
  if (expired.more) due.push(now);
  const nextAt = due.length > 0 ? Math.max(now + UPKEEP_INTERVAL_MS, Math.min(...due)) : null;
  console.info(
    `[room-upkeep] id=${documentId} changesets=${changesets} sheets=${expired.sheets} next=${nextAt ?? 'none'}`,
  );
  return { changesets, sheets: expired.sheets, nextAt };
}

// When the upkeep runs after a write at `now`, with none scheduled: once the room is quiet, and no sooner than a
// day after its last run.
export function upkeepAfterWrite(now: number, lastRunAt: number, idleMs: number): number {
  return Math.max(now + idleMs, lastRunAt + UPKEEP_INTERVAL_MS);
}

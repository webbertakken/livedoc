// The content summaries' one-off refresh (docs/specs/006-document/document-storage.md "Refreshing the summaries"):
// off unless the Worker variable `SUMMARY_REFRESH` is `dry` or `run`. Each minute it asks up to SUMMARY_REFRESH_BATCH
// rooms of documents not done yet (or whose try failed an hour ago) for their summary and compares it with D1's.
// `dry` writes only the flags to `summary_refreshes`; `run` also writes a changed summary, but only over the one it
// compared, so a room's push in between, which is newer, stands. The saved time never moves.
import type { ContentSummary } from '../db/content-summary';
import { documentRoom } from '../document-room/document-client';
import type { Env } from '../types';

/** The switch's two settings; absent or anything else is off. */
export const SUMMARY_REFRESH_DRY = 'dry';
export const SUMMARY_REFRESH_RUN = 'run';
/** Documents one sweep checks. */
export const SUMMARY_REFRESH_BATCH = 25;
/** Rooms asked at once: Workers' open connections. */
export const SUMMARY_REFRESH_CONCURRENCY = 6;
/** A failed check is tried again at most once an hour. */
export const SUMMARY_REFRESH_RETRY_MS = 3_600_000;

export type SummaryRefreshSweep = {
  found: number;
  checked: number;
  written: number;
  failed: number;
};

type SweepEnv = Pick<Env, 'DB' | 'DOCUMENT_ROOM' | 'SUMMARY_REFRESH'>;
type Mode = typeof SUMMARY_REFRESH_DRY | typeof SUMMARY_REFRESH_RUN;
type Due = { id: string; content_summary: string | null };
type Check = { changed: boolean; gains: boolean; fresh: string };

const NOTHING: SummaryRefreshSweep = { found: 0, checked: 0, written: 0, failed: 0 };

function modeOf(value: string | undefined): Mode | null {
  return value === SUMMARY_REFRESH_DRY || value === SUMMARY_REFRESH_RUN ? value : null;
}

// Whether a stored summary already says it holds a text document; one that is not JSON says nothing.
function saysTextDocument(stored: string | null): boolean {
  if (stored === null) return false;
  try {
    return (JSON.parse(stored) as Partial<ContentSummary> | null)?.textDocument === true;
  } catch {
    return false;
  }
}

function checkOf(stored: string | null, summary: ContentSummary): Check {
  const fresh = JSON.stringify(summary);
  return {
    changed: stored !== fresh,
    gains: summary.textDocument === true && !saysTextDocument(stored),
    fresh,
  };
}

function recordStatement(
  env: SweepEnv,
  documentId: string,
  check: Check | { error: string },
  now: number,
  written: boolean,
): D1PreparedStatement {
  const ok = 'fresh' in check;
  return env.DB.prepare(
    `INSERT INTO summary_refreshes (document_id, changed, gains_text_document, checked_at, written_at, error)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (document_id) DO UPDATE SET changed = excluded.changed,
       gains_text_document = excluded.gains_text_document, checked_at = excluded.checked_at,
       written_at = excluded.written_at, error = excluded.error`,
  ).bind(
    documentId,
    ok && check.changed ? 1 : 0,
    ok && check.gains ? 1 : 0,
    now,
    written ? now : null,
    ok ? null : check.error,
  );
}

// Documents due: dry, any not checked yet; run, any not written yet. A failed try waits an hour either way.
function dueQuery(mode: Mode): string {
  const again =
    mode === SUMMARY_REFRESH_DRY
      ? 'r.error IS NOT NULL AND r.checked_at < ?1'
      : 'r.written_at IS NULL AND (r.error IS NULL OR r.checked_at < ?1)';
  return `SELECT d.id, d.content_summary FROM documents d
            LEFT JOIN summary_refreshes r ON r.document_id = d.id
           WHERE r.document_id IS NULL OR (${again})
           ORDER BY d.created_at, d.id
           LIMIT ?2`;
}

export async function sweepSummaryRefresh(
  env: SweepEnv,
  now: number,
): Promise<SummaryRefreshSweep> {
  const mode = modeOf(env.SUMMARY_REFRESH);
  if (!mode) return NOTHING;
  const due = await env.DB.prepare(dueQuery(mode))
    .bind(now - SUMMARY_REFRESH_RETRY_MS, SUMMARY_REFRESH_BATCH)
    .all<Due>();
  const docs = due.results ?? [];
  if (docs.length === 0) return NOTHING;
  const writes: D1PreparedStatement[] = [];
  let failed = 0;
  let written = 0;
  let next = 0;
  const worker = async () => {
    while (next < docs.length) {
      const { id, content_summary: stored } = docs[next++]!;
      try {
        const check = checkOf(stored, await documentRoom(env, id).contentSummary());
        const flags = `changed=${check.changed ? 1 : 0} textDocument=${check.gains ? 1 : 0}`;
        if (mode === SUMMARY_REFRESH_DRY) {
          console.info(`[summary-refresh] dry ${id} ${flags}`);
          writes.push(recordStatement(env, id, check, now, false));
          continue;
        }
        if (check.changed) {
          writes.push(
            env.DB.prepare(
              'UPDATE documents SET content_summary = ?2 WHERE id = ?1 AND content_summary IS ?3',
            ).bind(id, check.fresh, stored),
          );
          written++;
        }
        console.info(`[summary-refresh] wrote ${id} ${flags}`);
        writes.push(recordStatement(env, id, check, now, true));
      } catch (error) {
        const reason = error instanceof Error ? error.name : typeof error;
        console.error(`[summary-refresh] failed ${id} ${reason}`, error);
        failed++;
        writes.push(recordStatement(env, id, { error: reason }, now, false));
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SUMMARY_REFRESH_CONCURRENCY, docs.length) }, worker),
  );
  await env.DB.batch(writes);
  const result = { found: docs.length, checked: docs.length - failed, written, failed };
  console.log(
    `[summary-refresh] sweep mode=${mode} found=${result.found} checked=${result.checked} written=${result.written} failed=${result.failed}`,
  );
  return result;
}

// Empty document clean-up (docs/specs/013-workspace/empty-document-cleanup.md):
// the daily cron moves every live document with no element on any of its tabs,
// unsaved for 30 days, to the Trash. It stamps the sweep's own time, so the
// Trash's purge still gives it the full 30 days there.

import { EMPTY_DOCUMENT_STALE_MS } from '@livedoc/api-schema';
import type { Env } from '../types';

// Documents per statement: one bounded UPDATE over a scan measured at ~10 ms on
// production (docs/specs/013-workspace/empty-document-cleanup.md).
const EMPTY_SWEEP_BATCH = 500;
// Statements per cron run: 4 x 500 = 2,000 moves a day, the Trash purge's
// order. A larger backlog drains over the following days, oldest save first.
const EMPTY_SWEEP_MAX_BATCHES = 4;

// Select and move in one statement, so a document saved a moment before it runs is judged on that save. Whether a
// document has content is its room's to say, by the test the room applies to its tabs (an element, an article or a
// form, a body that is not JSON counting as content; document-room/content-summary.ts), pushed as its content
// summary. A document whose summary has never landed is unknown and stays (docs/specs/006-document/document-storage.md
// "The content summary").
const MOVE_EMPTY_STALE = `
  UPDATE documents SET trashed_at = ?1, trash_reason = 'empty'
   WHERE id IN (
     SELECT d.id FROM documents d
      WHERE d.trashed_at IS NULL AND d.saved_at <= ?2
        AND d.content_summary IS NOT NULL
        AND json_extract(d.content_summary, '$.hasContent') = 0
      ORDER BY d.saved_at ASC, d.id ASC
      LIMIT ?3)`;

// Move what is empty and stale at `now` to the Trash, at most
// maxBatches x batch per run. Returns how many moved.
export async function trashEmptyDocuments(
  env: Env,
  now: number,
  opts: { batch?: number; maxBatches?: number } = {},
): Promise<number> {
  const batch = opts.batch ?? EMPTY_SWEEP_BATCH;
  const maxBatches = opts.maxBatches ?? EMPTY_SWEEP_MAX_BATCHES;
  const cutoff = now - EMPTY_DOCUMENT_STALE_MS;
  let moved = 0;
  for (let round = 0; round < maxBatches; round++) {
    const res = await env.DB.prepare(MOVE_EMPTY_STALE).bind(now, cutoff, batch).run();
    const changes = res.meta.changes ?? 0;
    moved += changes;
    if (changes < batch) break;
  }
  return moved;
}

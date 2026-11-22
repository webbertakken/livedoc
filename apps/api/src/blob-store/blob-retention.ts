// The blob store's retention sweep (docs/specs/006-document/blob-store.md "Holds and retention"): daily, it forgets
// unfinished uploads and claims never stored, and deletes blobs nothing has held for the grace. It reads only what
// the rooms pushed (document_blobs) and keeps bytes whenever in doubt.
import { FILE_UNHELD_GRACE_HOURS, FILE_UPLOAD_ABANDON_HOURS } from '@livedoc/document';
import type { Env } from '../types';
import { abandonParts } from './blob-parts';

type SweepEnv = Pick<Env, 'DB' | 'FILES'>;

const HOUR_MS = 3_600_000;
// R2's delete takes at most 1000 names a call.
export const FILE_SWEEP_PAGE = 1000;
/** (default) Fewer unheld blobs than this never trip the wire: a gap in the index is never that small. */
export const FILE_SWEEP_TRIPWIRE_MIN = 20;
/** (default) The most a tripped run deletes, oldest first. Never zero: a tripwire that deleted nothing would latch. */
export const FILE_SWEEP_TRIPPED_MAX = 100;
const FILE_SWEEP_TRIPWIRE_RATIO = 0.5;

/** A run that would delete more than half of the old blobs, and more than the least, is slowed. */
export const blobSweepTripped = (old: number, unheld: number): boolean =>
  unheld > FILE_SWEEP_TRIPWIRE_MIN && unheld / old > FILE_SWEEP_TRIPWIRE_RATIO;

// A hold of the blob's owner that stands at ?1 (now): a tab naming the key, or a previous version before its day.
const HELD = `EXISTS (SELECT 1 FROM document_blobs h JOIN documents d ON d.id = h.document_id
                WHERE h.key = blobs.key AND d.owner_id = blobs.owner_id
                  AND (h.until IS NULL OR h.until > ?1))`;

// Deletes the objects no row names any more. A row moved to another owner, or given to one, names its object still.
async function deleteUnnamedObjects(env: SweepEnv, bucket: R2Bucket, objects: readonly string[]) {
  if (objects.length === 0) return;
  const named = await env.DB.prepare(
    'SELECT DISTINCT object FROM blobs WHERE object IN (SELECT value FROM json_each(?))',
  )
    .bind(JSON.stringify(objects))
    .all<{ object: string }>();
  const kept = new Set(named.results.map((row) => row.object));
  const gone = objects.filter((object) => !kept.has(object));
  if (gone.length === 0) return;
  try {
    await bucket.delete(gone);
  } catch (err) {
    // The rows are gone and the bytes stay: storage kept, never a tab without its file.
    console.error(`[blob-store] sweep delete failed count=${gone.length}`, err);
  }
}

// Unfinished uploads past their day: object storage's own upload aborted, the row gone.
async function forgetUploads(env: SweepEnv, bucket: R2Bucket, cutoff: number): Promise<number> {
  const old = await env.DB.prepare(
    'SELECT id, r2_upload FROM blob_uploads WHERE begun_at < ? ORDER BY begun_at LIMIT ?',
  )
    .bind(cutoff, FILE_SWEEP_PAGE)
    .all<{ id: string; r2_upload: string }>();
  for (const upload of old.results) {
    try {
      await abandonParts(bucket, { id: upload.id, r2Upload: upload.r2_upload });
    } catch (err) {
      console.error(`[blob-store] sweep abandon failed upload=${upload.id}`, err);
      continue;
    }
    await env.DB.prepare('DELETE FROM blob_uploads WHERE id = ?').bind(upload.id).run();
  }
  return old.results.length;
}

// Claims never stored, past the same day, with no upload still going: a put that failed, a file that did not hash
// to its key. Whatever storage has under the claim's object goes with it.
async function forgetClaims(env: SweepEnv, bucket: R2Bucket, cutoff: number): Promise<void> {
  const gone = await env.DB.prepare(
    `DELETE FROM blobs
      WHERE stored_at IS NULL AND claimed_at < ?
        AND NOT EXISTS (SELECT 1 FROM blob_uploads u WHERE u.owner_id = blobs.owner_id AND u.key = blobs.key)
      RETURNING object`,
  )
    .bind(cutoff)
    .all<{ object: string }>();
  await deleteUnnamedObjects(
    env,
    bucket,
    gone.results.map((row) => row.object),
  );
}

type Candidate = { owner_id: string; key: string };

// Deletes one page of candidates: the rows still unheld at this instant, then their objects.
async function reapPage(
  env: SweepEnv,
  bucket: R2Bucket,
  now: number,
  page: readonly Candidate[],
): Promise<number> {
  const gone = await env.DB.prepare(
    `DELETE FROM blobs
      WHERE (owner_id, key) IN (SELECT c.value ->> '$.owner_id', c.value ->> '$.key' FROM json_each(?2) c)
        AND stored_at IS NOT NULL AND NOT ${HELD}
      RETURNING object`,
  )
    .bind(now, JSON.stringify(page))
    .all<{ object: string }>();
  await deleteUnnamedObjects(
    env,
    bucket,
    gone.results.map((row) => row.object),
  );
  return gone.results.length;
}

// Blobs stored before the grace that nothing holds now.
async function reapUnheld(env: SweepEnv, bucket: R2Bucket, now: number): Promise<number> {
  // A document whose room has never pushed has unknown holds, so the sweep waits until every document has
  // (docs/specs/006-document/document-storage.md "The content summary").
  const { n: unknown } = (await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM documents WHERE content_summary IS NULL',
  ).first<{ n: number }>())!;
  if (unknown > 0) {
    console.log(`[blob-store] sweep-paused documents=${unknown}`);
    return 0;
  }
  const cutoff = now - FILE_UNHELD_GRACE_HOURS * HOUR_MS;
  const { old, unheld } = (await env.DB.prepare(
    `SELECT COUNT(*) AS old, COALESCE(SUM(NOT ${HELD}), 0) AS unheld
       FROM blobs WHERE stored_at < ?2`,
  )
    .bind(now, cutoff)
    .first<{ old: number; unheld: number }>())!;
  if (unheld === 0) return 0;
  const tripped = blobSweepTripped(old, unheld);
  if (tripped)
    console.error(
      `[blob-store] sweep-tripwire unheld=${unheld} old=${old}; deleting at most ${FILE_SWEEP_TRIPPED_MAX}, oldest first`,
    );
  const limit = tripped ? FILE_SWEEP_TRIPPED_MAX : FILE_SWEEP_PAGE;
  let deleted = 0;
  for (;;) {
    const page = await env.DB.prepare(
      `SELECT owner_id, key FROM blobs
        WHERE stored_at < ?2 AND NOT ${HELD}
        ORDER BY stored_at, owner_id, key LIMIT ?3`,
    )
      .bind(now, cutoff, limit)
      .all<Candidate>();
    const reaped = await reapPage(env, bucket, now, page.results);
    deleted += reaped;
    // A tripped run is one page, and so is the last; a page of candidates all held again deletes nothing and ends
    // the run, never repeats it.
    if (tripped || reaped < limit) return deleted;
  }
}

/** One run of the sweep. A no-op without the bucket. */
export async function sweepBlobs(
  env: SweepEnv,
  now: number,
): Promise<{ blobs: number; uploads: number }> {
  if (!env.FILES) return { blobs: 0, uploads: 0 };
  const abandoned = now - FILE_UPLOAD_ABANDON_HOURS * HOUR_MS;
  const uploads = await forgetUploads(env, env.FILES, abandoned);
  await forgetClaims(env, env.FILES, abandoned);
  const blobs = await reapUnheld(env, env.FILES, now);
  console.log(`[blob-store] swept count=${blobs} uploads=${uploads}`);
  return { blobs, uploads };
}

/** Everything an owner holds goes, as their account closes: rows, uploads, and the objects no one else names. */
export async function forgetOwnerBlobs(env: SweepEnv, ownerId: string): Promise<number> {
  const uploads = await env.DB.prepare(
    'DELETE FROM blob_uploads WHERE owner_id = ? RETURNING id, r2_upload',
  )
    .bind(ownerId)
    .all<{ id: string; r2_upload: string }>();
  const rows = await env.DB.prepare('DELETE FROM blobs WHERE owner_id = ? RETURNING object')
    .bind(ownerId)
    .all<{ object: string }>();
  if (env.FILES) {
    for (const upload of uploads.results)
      await abandonParts(env.FILES, { id: upload.id, r2Upload: upload.r2_upload });
    const objects = rows.results.map((row) => row.object);
    for (let at = 0; at < objects.length; at += FILE_SWEEP_PAGE)
      await deleteUnnamedObjects(env, env.FILES, objects.slice(at, at + FILE_SWEEP_PAGE));
  }
  return rows.results.length;
}

// A blob store row given, never bytes (docs/specs/006-document/blob-store.md "Where the bytes live"): someone who
// copies another owner's document, and an owner a document passes to, is given a row for each key, naming the object
// the bytes are already in. No byte moves. The object stays for as long as any row names it (blob-retention.ts).
import { isBlobKey, type BlobKey } from '@livedoc/document';
import type { Env } from '../types';

type Db = Pick<Env, 'DB'>;

// A key the receiver already holds stays as it is; a claim of theirs not yet stored becomes the given row.
const GIVEN = `ON CONFLICT (owner_id, key) DO UPDATE
                 SET size = excluded.size, object = excluded.object, stored_at = excluded.stored_at
               WHERE blobs.stored_at IS NULL`;

/** The keys a copied tab's stored body names: a PDF tab's stored file. None for any other body. */
export function blobKeysOfTabData(data: string): BlobKey[] {
  let body: { kind?: unknown; blob?: unknown } | null;
  try {
    body = JSON.parse(data) as { kind?: unknown; blob?: unknown } | null;
  } catch {
    return [];
  }
  return body?.kind === 'pdf' && isBlobKey(body.blob) ? [body.blob] : [];
}

// The rows of `keys` that the source document's owner holds, for a copier who is someone else.
const COPIED = `FROM documents d JOIN blobs b ON b.owner_id = d.owner_id
               WHERE d.id = ?1 AND d.owner_id <> ?2 AND b.stored_at IS NOT NULL
                 AND b.key IN (SELECT value FROM json_each(?3))`;

/** A copy carries the keys its tabs name: the copier is given each one the source's owner holds. */
export function blobGiveCopyStatements(
  env: Db,
  sourceId: string,
  toOwnerId: string,
  keys: readonly BlobKey[],
  now: number,
): D1PreparedStatement[] {
  if (keys.length === 0) return [];
  return [
    env.DB.prepare(
      `INSERT INTO blobs (owner_id, key, size, object, claimed_at, stored_at)
       SELECT ?2, b.key, b.size, b.object, ?4, ?4 ${COPIED} ${GIVEN}`,
    ).bind(sourceId, toOwnerId, JSON.stringify(keys), now),
  ];
}

/** How many bytes the copy would add to the copier's usage: what they are given and do not hold already. */
export async function blobGiveBytes(
  env: Db,
  sourceId: string,
  toOwnerId: string,
  keys: readonly BlobKey[],
): Promise<number> {
  if (keys.length === 0) return 0;
  // An aggregate always answers a row.
  const row = (await env.DB.prepare(
    `SELECT COALESCE(SUM(b.size), 0) AS bytes ${COPIED}
        AND NOT EXISTS (SELECT 1 FROM blobs mine WHERE mine.owner_id = ?2 AND mine.key = b.key
                           AND mine.stored_at IS NOT NULL)`,
  )
    .bind(sourceId, toOwnerId, JSON.stringify(keys))
    .first<{ bytes: number }>())!;
  return row.bytes;
}

/**
 * Documents passing to another owner (a team's heir, a team document moved into someone's own library): the new
 * owner is given every key those documents have told they hold, previous versions too. Run in the batch that
 * changes the owner, before it. `where` picks the documents, a SQL condition on `d`, its params bound from ?3 on.
 */
export function blobGiveOwnerChangeStatement(
  env: Db,
  toOwnerId: string,
  where: string,
  params: readonly (string | number | null)[],
  now: number,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO blobs (owner_id, key, size, object, claimed_at, stored_at)
     SELECT ?2, b.key, b.size, b.object, ?1, ?1
       FROM documents d
       JOIN document_blobs h ON h.document_id = d.id
       JOIN blobs b ON b.owner_id = d.owner_id AND b.key = h.key AND b.stored_at IS NOT NULL
      WHERE d.owner_id <> ?2 AND (${where})
     ${GIVEN}`,
  ).bind(now, toOwnerId, ...params);
}

/** What the blob store logs of rows given ("Observability"): the receiving document or team, never a key. */
export function logBlobsGiven(count: number, reason: 'copy' | 'owner', document: string): void {
  if (count > 0)
    console.info(`[blob-store] given count=${count} reason=${reason} document=${document}`);
}

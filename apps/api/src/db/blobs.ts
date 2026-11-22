// What an owner holds in the blob store (docs/specs/006-document/blob-store.md "Where the bytes live"): a row per
// owner and key, naming the object. A row is a claim until storage has taken and checked the bytes; only a stored
// row is held. The object is named when the row is made and never renamed, so rows move between owners, not bytes.
import type { BlobKey } from '@livedoc/document';
import type { Env } from '../types';

type Db = Pick<Env, 'DB'>;

/** A blob an owner holds: its size and the object its bytes are. */
export type HeldBlob = { readonly size: number; readonly object: string };

/**
 * The object a blob is stored as when an owner claims its key: the owner's id, the key, and a mark of the claim's
 * own. A key claimed again after its blob was swept is therefore another object, never the one being deleted.
 */
export const blobObjectName = (ownerId: string, key: BlobKey, mark: string): string =>
  `${ownerId}/${key}.${mark}`;

const claimMark = (): string => crypto.randomUUID().slice(0, 8);

/** The blob the owner holds under the key, or null: what an upload begins by asking. */
export async function heldBlob(env: Db, ownerId: string, key: BlobKey): Promise<HeldBlob | null> {
  return env.DB.prepare(
    'SELECT size, object FROM blobs WHERE owner_id = ? AND key = ? AND stored_at IS NOT NULL',
  )
    .bind(ownerId, key)
    .first<HeldBlob>();
}

/**
 * The size of the blob a document's owner holds under the key, or null: what a tab of that document may name. One
 * read, whoever the owner is by now (a guest who signed up took their rows with them).
 */
export async function documentOwnerBlobSize(
  env: Db,
  documentId: string,
  key: BlobKey,
): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT b.size FROM documents d JOIN blobs b ON b.owner_id = d.owner_id
      WHERE d.id = ? AND b.key = ? AND b.stored_at IS NOT NULL`,
  )
    .bind(documentId, key)
    .first<{ size: number }>();
  return row?.size ?? null;
}

/**
 * Claims the key for the owner before the first byte, and answers the object the bytes go to. A claim made again
 * (an upload tried again) is the same row, its day renewed; a key already held keeps its row untouched.
 */
export async function claimBlob(
  env: Db,
  ownerId: string,
  key: BlobKey,
  size: number,
  now: number,
): Promise<string> {
  const [, row] = await env.DB.batch<{ object: string }>([
    env.DB.prepare(
      `INSERT INTO blobs (owner_id, key, size, object, claimed_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (owner_id, key) DO UPDATE SET size = excluded.size, claimed_at = excluded.claimed_at
        WHERE blobs.stored_at IS NULL`,
    ).bind(ownerId, key, size, blobObjectName(ownerId, key, claimMark()), now),
    env.DB.prepare('SELECT object FROM blobs WHERE owner_id = ? AND key = ?').bind(ownerId, key),
  ]);
  return row!.results[0]!.object;
}

/** The claim is held from now on: storage took the bytes and checked them against the key. */
export async function markBlobStored(
  env: Db,
  ownerId: string,
  key: BlobKey,
  size: number,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE blobs SET size = ?3, stored_at = ?4
      WHERE owner_id = ?1 AND key = ?2 AND stored_at IS NULL`,
  )
    .bind(ownerId, key, size, now)
    .run();
}

/** What an owner's blobs count ("Usage"): each distinct key once, claims never. */
export async function blobUsage(
  env: Db,
  ownerId: string,
): Promise<{ bytes: number; blobs: number }> {
  // An aggregate always answers a row.
  return (await env.DB.prepare(
    `SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS blobs
       FROM blobs WHERE owner_id = ? AND stored_at IS NOT NULL`,
  )
    .bind(ownerId)
    .first<{ bytes: number; blobs: number }>())!;
}

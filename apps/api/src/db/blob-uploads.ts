// An upload in parts that is not finished (docs/specs/006-document/blob-store.md "Getting bytes in"): object
// storage's own upload and the parts it has. One per owner, key and size, so beginning again resumes it.
import type { BlobKey } from '@livedoc/document';
import type { Env } from '../types';

type Db = Pick<Env, 'DB'>;

export type BlobUpload = {
  readonly id: string;
  readonly ownerId: string;
  readonly key: BlobKey;
  readonly size: number;
  /** Object storage's id of the upload. */
  readonly r2Upload: string;
  /** The parts storage has, by number, each with the tag storage gave it. */
  readonly parts: Readonly<Record<string, string>>;
  readonly begunAt: number;
};

type Row = {
  id: string;
  owner_id: string;
  key: BlobKey;
  size: number;
  r2_upload: string;
  parts: string;
  begun_at: number;
};

const COLUMNS = 'id, owner_id, key, size, r2_upload, parts, begun_at';

const uploadOf = (row: Row): BlobUpload => ({
  id: row.id,
  ownerId: row.owner_id,
  key: row.key,
  size: row.size,
  r2Upload: row.r2_upload,
  parts: JSON.parse(row.parts) as Record<string, string>,
  begunAt: row.begun_at,
});

/** The numbers of the parts an upload has, in order. */
export const storedParts = (upload: BlobUpload): number[] =>
  Object.keys(upload.parts)
    .map(Number)
    .sort((a, b) => a - b);

/** The owner's unfinished upload of that key and size, or null: what beginning again resumes. */
export async function unfinishedBlobUpload(
  env: Db,
  ownerId: string,
  key: BlobKey,
  size: number,
): Promise<BlobUpload | null> {
  const row = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM blob_uploads WHERE owner_id = ? AND key = ? AND size = ?`,
  )
    .bind(ownerId, key, size)
    .first<Row>();
  return row ? uploadOf(row) : null;
}

/** The upload by its id, only for the owner and key it was begun for. */
export async function blobUpload(
  env: Db,
  id: string,
  ownerId: string,
  key: BlobKey,
): Promise<BlobUpload | null> {
  const row = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM blob_uploads WHERE id = ? AND owner_id = ? AND key = ?`,
  )
    .bind(id, ownerId, key)
    .first<Row>();
  return row ? uploadOf(row) : null;
}

/** Records a begun upload; false when the owner already has one of that key and size (two began at once). */
export async function insertBlobUpload(
  env: Db,
  upload: Omit<BlobUpload, 'parts'>,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO blob_uploads (id, owner_id, key, size, r2_upload, begun_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(upload.id, upload.ownerId, upload.key, upload.size, upload.r2Upload, upload.begunAt)
    .run();
  return res.meta.changes > 0;
}

/** Storage has part `n`, under that tag; sent again, a part replaces itself. Answers the parts it has now. */
export async function recordBlobUploadPart(
  env: Db,
  id: string,
  n: number,
  etag: string,
): Promise<number[]> {
  const row = await env.DB.prepare(
    `UPDATE blob_uploads SET parts = json_set(parts, '$."' || ?2 || '"', ?3) WHERE id = ?1
     RETURNING ${COLUMNS}`,
  )
    .bind(id, String(n), etag)
    .first<Row>();
  return row ? storedParts(uploadOf(row)) : [];
}

export async function deleteBlobUpload(env: Db, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM blob_uploads WHERE id = ?').bind(id).run();
}

// custom_stamps (docs/specs/035-pdf-documents/custom-stamps.md "Where they are kept"): a person's own stamps,
// owner-scoped as custom themes are. A custom stamp holds its picture, a blob of its owner's, while it is kept.
import {
  PDF_CUSTOM_STAMPS_MAX,
  type CustomStampInput,
  type CustomStampPatch,
  type CustomStampRecord,
} from '@livedoc/pdf-documents';
import type { BlobKey } from '@livedoc/document';
import type { Env } from '../types';

type Db = Pick<Env, 'DB'>;

type CustomStampRow = {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  picture_key: string;
  picture_type: string;
  width: number;
  height: number;
  natural_width: number;
  natural_height: number;
  created_at: number;
  updated_at: number;
};

/** A kept custom stamp and whose it is. */
export type OwnedCustomStamp = { readonly ownerId: string; readonly stamp: CustomStampRecord };

const COLS =
  'id, owner_id, name, category, picture_key, picture_type, width, height, natural_width, natural_height, created_at, updated_at';

const recordOf = (row: CustomStampRow): CustomStampRecord => ({
  id: row.id,
  name: row.name,
  category: row.category,
  picture: {
    key: row.picture_key as BlobKey,
    type: row.picture_type === 'jpeg' ? 'jpeg' : 'png',
    width: row.width,
    height: row.height,
  },
  natural: { width: row.natural_width, height: row.natural_height },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** The owner's custom stamps, newest first. */
export async function listCustomStamps(env: Db, ownerId: string): Promise<CustomStampRecord[]> {
  const rows = await env.DB.prepare(
    `SELECT ${COLS} FROM custom_stamps WHERE owner_id = ? ORDER BY created_at DESC, id`,
  )
    .bind(ownerId)
    .all<CustomStampRow>();
  return (rows.results ?? []).map(recordOf);
}

/** A custom stamp by its id, and whose it is; null where none is kept. */
export async function getCustomStamp(env: Db, id: string): Promise<OwnedCustomStamp | null> {
  const row = await env.DB.prepare(`SELECT ${COLS} FROM custom_stamps WHERE id = ?`)
    .bind(id)
    .first<CustomStampRow>();
  return row ? { ownerId: row.owner_id, stamp: recordOf(row) } : null;
}

/** How many custom stamps the owner keeps. */
export async function countCustomStamps(env: Db, ownerId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM custom_stamps WHERE owner_id = ?')
    .bind(ownerId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Keeps a custom stamp for its owner, where they keep fewer than `PDF_CUSTOM_STAMPS_MAX` at that instant; answers it,
 * or null where they keep the most already (two makes at once never pass the cap together).
 */
export async function createCustomStamp(
  env: Db,
  ownerId: string,
  input: CustomStampInput,
  now: number,
): Promise<CustomStampRecord | null> {
  const made = await env.DB.prepare(
    `INSERT INTO custom_stamps (${COLS})
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11
      WHERE (SELECT COUNT(*) FROM custom_stamps WHERE owner_id = ?2) < ?12`,
  )
    .bind(
      input.id,
      ownerId,
      input.name,
      input.category,
      input.picture.key,
      input.picture.type,
      input.picture.width,
      input.picture.height,
      input.natural.width,
      input.natural.height,
      now,
      PDF_CUSTOM_STAMPS_MAX,
    )
    .run();
  if ((made.meta.changes ?? 0) === 0) return null;
  return { ...input, createdAt: now, updatedAt: now };
}

/** Renames a custom stamp or moves it to another category. */
export async function updateCustomStamp(
  env: Db,
  id: string,
  patch: CustomStampPatch,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE custom_stamps SET name = COALESCE(?2, name), category = COALESCE(?3, category), updated_at = ?4
      WHERE id = ?1`,
  )
    .bind(id, patch.name ?? null, patch.category ?? null, now)
    .run();
}

/** Deletes a custom stamp; its picture is then held by nothing of its own. */
export async function deleteCustomStamp(env: Db, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM custom_stamps WHERE id = ?').bind(id).run();
}

/** Moves every one of the owner's custom stamps in `from` to `to`; how many moved. */
export async function renameCustomStampCategory(
  env: Db,
  ownerId: string,
  from: string,
  to: string,
  now: number,
): Promise<number> {
  const res = await env.DB.prepare(
    'UPDATE custom_stamps SET category = ?3, updated_at = ?4 WHERE owner_id = ?1 AND category = ?2',
  )
    .bind(ownerId, from, to, now)
    .run();
  return res.meta.changes ?? 0;
}

/** Deletes every one of the owner's custom stamps in a category; how many went. */
export async function deleteCustomStampCategory(
  env: Db,
  ownerId: string,
  category: string,
): Promise<number> {
  const res = await env.DB.prepare('DELETE FROM custom_stamps WHERE owner_id = ? AND category = ?')
    .bind(ownerId, category)
    .run();
  return res.meta.changes ?? 0;
}

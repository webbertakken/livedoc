// image_grants: which documents may serve an image their owner does not own
// (docs/specs/009-elements/images.md, "Placement grants").
//
// A reference alone (image_refs) does not let a document serve an image: an id
// pasted into an unrelated document must not keep the bytes reachable after its
// reader loses access to the original. A document serves image X when X's
// owner owns the document, or the document holds a grant for X. Grants are
// written only at trusted moments: when the document's room pushes the images it
// places while X's owner is tied to the document (document-room/document-outbox.ts),
// and when a copy carries an image its source could serve. Until that push lands,
// an owner who is tied to the document right now is served as if granted.

import type { Env } from '../types';
import { visitLinkSql } from './visit-link';

// Image `i`'s owner is tied to document `d` right now: a joined member of its team, or an editor or Participant
// through a live share link. `now` is the bound parameter the link expiry is read against.
function entitledSql(now: string): string {
  return `((d.team_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM team_members m
               WHERE m.team_id = d.team_id AND m.user_id = i.owner_id AND m.status = 'joined'))
           OR EXISTS (
              SELECT 1 FROM shared_with s
               WHERE s.owner_id = i.owner_id AND s.document_id = d.id
                 AND (s.role = 'edit' OR s.level = 'participate')
                 AND d.shareable = 1 AND ${visitLinkSql(now)} IS NOT NULL))`;
}

// The one predicate every reader shares: document `d` (aliased) may serve image
// `i` (aliased). Owner match first, so the common case never touches the
// grants table; the grant lookup is a primary-key probe; an owner entitled now is
// served before the room's push writes the grant.
function servesSql(now: string): string {
  return `(i.owner_id = d.owner_id
   OR EXISTS (SELECT 1 FROM image_grants g WHERE g.document_id = d.id AND g.image_id = i.id)
   OR ${entitledSql(now)})`;
}

// ---------- Writers ---------------------------------------------------

// A document changing owner (a member leaving a team hands their work on; a team document moved into someone's
// own library): the images its owner placed served only because they owned it, so they stop serving the moment
// someone else does. Grant each one first, in the same batch as the owner change, to the documents `where`
// picks (a SQL condition on `d`, its params bound from ?2 on). A grant outlives the membership
// (docs/specs/009-elements/images.md "Placement grants").
export function imageGrantOwnerChangeStatement(
  env: Env,
  where: string,
  params: readonly (string | number | null)[],
  now: number,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO image_grants (document_id, image_id, created_at)
     SELECT DISTINCT d.id, i.id, ?1
       FROM documents d
       JOIN document_images r ON r.document_id = d.id
       JOIN images i ON i.id = r.image_id AND i.owner_id = d.owner_id
      WHERE ${where}`,
  ).bind(now, ...params);
}

// For each image the document places, as its room pushes them (document-outbox.ts): grant it
// when the image's owner is entitled to place it there right now, as a joined
// member of the document's team, or a collaborator who may add content whose visit's
// link is still live: an edit collaborator, or a Participant
// (docs/specs/013-workspace/share-roles.md), who places images too. A revoked or
// expired link earns nothing, so an id pasted after access went cannot be laundered
// into a grant. The writer's identity is not needed. An image the document's owner
// owns needs no row.
export function imageGrantPlacementStatements(
  env: Env,
  documentId: string,
  ids: readonly string[],
  now: number,
): D1PreparedStatement[] {
  if (ids.length === 0) return [];
  return [
    env.DB.prepare(
      `INSERT OR IGNORE INTO image_grants (document_id, image_id, created_at)
       SELECT d.id, i.id, ?3
         FROM documents d
         JOIN images i ON i.id IN (SELECT value FROM json_each(?2))
        WHERE d.id = ?1
          AND i.owner_id <> d.owner_id
          AND ${entitledSql('?3')}`,
    ).bind(documentId, JSON.stringify(ids), now),
  ];
}

// A copy carries every image of the copied bodies that its source may serve,
// as a grant on the new document. The copier's own images need none (they own
// the copy); one the source could not serve is not laundered into a grant.
export function imageGrantCopyStatements(
  env: Env,
  sourceId: string,
  targetId: string,
  ids: string[],
  now: number,
): D1PreparedStatement[] {
  if (ids.length === 0) return [];
  return [
    env.DB.prepare(
      `INSERT OR IGNORE INTO image_grants (document_id, image_id, created_at)
       SELECT ?2, i.id, ?4
         FROM documents d
         JOIN images i ON i.id IN (SELECT value FROM json_each(?3))
        WHERE d.id = ?1
          AND ${servesSql('?4')}`,
    ).bind(sourceId, targetId, JSON.stringify(ids), now),
  ];
}

// Document removal: the grants go with the document (no foreign key).
export function imageGrantRemovalStatement(
  env: Env,
  doomedDocuments: string,
  bind: unknown[],
): D1PreparedStatement {
  return env.DB.prepare(`DELETE FROM image_grants WHERE document_id IN (${doomedDocuments})`).bind(
    ...bind,
  );
}

// ---------- Readers ---------------------------------------------------

// The byte endpoint's share check, its D1 half: document `documentId` may serve image `imageId`. Whether it
// places the image (on a tab-scoped visitor's tab only) is its room's half (the `placesImage` RPC). One query.
export async function documentMayServeImage(
  env: Env,
  documentId: string,
  imageId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS present
       FROM documents d
       JOIN images i ON i.id = ?1
      WHERE d.id = ?2
        AND ${servesSql('?3')}
      LIMIT 1`,
  )
    .bind(imageId, documentId, Date.now())
    .first<{ present: number }>();
  return row !== null;
}

// The server renderer's filter: of `ids` (read from a tab of `documentId`), the
// ones the document may serve. One query for the whole tab.
export async function servableImageIds(
  env: Env,
  documentId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await env.DB.prepare(
    `SELECT i.id AS id
       FROM documents d
       JOIN images i ON i.id IN (SELECT value FROM json_each(?2))
      WHERE d.id = ?1
        AND ${servesSql('?3')}`,
  )
    .bind(documentId, JSON.stringify(ids), Date.now())
    .all<{ id: string }>();
  return new Set(rows.results.map((r) => r.id));
}

// A download's question (docs/specs/029-sheets/standard-mapping.md "Pictures in the file"): of `ids`, the ones the
// document may serve, each with its stored size and type. One query for the whole workbook.
export async function servableImageSizes(
  env: Env,
  documentId: string,
  ids: readonly string[],
): Promise<Map<string, { byteSize: number; contentType: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await env.DB.prepare(
    `SELECT i.id AS id, i.byte_size AS byteSize, i.content_type AS contentType
       FROM documents d
       JOIN images i ON i.id IN (SELECT value FROM json_each(?2))
      WHERE d.id = ?1
        AND ${servesSql('?3')}`,
  )
    .bind(documentId, JSON.stringify(ids), Date.now())
    .all<{ id: string; byteSize: number; contentType: string }>();
  return new Map(
    rows.results.map((r) => [r.id, { byteSize: r.byteSize, contentType: r.contentType }]),
  );
}

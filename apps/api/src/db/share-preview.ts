import type { Env } from '../types';
import type { DocumentThumbMeta } from './documents';

// What a link preview may show for a share code (docs/specs/013-workspace/share-link-previews.md): the document a
// working link opens and the tab it is scoped to. Null wherever the live image is withheld: an unknown, revoked or
// expired code, a trashed document, a share password (an all-whitespace one counts as none, as
// getDocumentSharePassword reads it).
export type SharePreviewSubject = { doc: DocumentThumbMeta; tabId: string | null };

type SubjectRow = {
  id: string;
  owner_id: string;
  team_id: string | null;
  name: string;
  saved_at: number;
  thumb_rendered_at: number | null;
  tab_id: string | null;
};

// One query, so a preview pays one round trip to D1, not three in a row: the link by its primary key, its document
// by its own.
export async function getSharePreviewSubject(
  env: Env,
  code: string,
): Promise<SharePreviewSubject | null> {
  const row = await env.DB.prepare(
    `SELECT d.id, d.owner_id, d.team_id, d.name, d.saved_at, d.thumb_rendered_at, s.tab_id
       FROM share_links s JOIN documents d ON d.id = s.document_id
      WHERE s.code = ? AND (s.expires_at IS NULL OR s.expires_at > ?)
        AND d.trashed_at IS NULL
        AND (d.share_password IS NULL OR trim(d.share_password, char(9, 10, 11, 12, 13, 32)) = '')`,
  )
    .bind(code, Date.now())
    .first<SubjectRow>();
  if (!row) return null;
  return {
    doc: {
      id: row.id,
      ownerId: row.owner_id,
      teamId: row.team_id ?? null,
      name: row.name,
      savedAt: row.saved_at,
      thumbRenderedAt: row.thumb_rendered_at ?? null,
    },
    tabId: row.tab_id ?? null,
  };
}

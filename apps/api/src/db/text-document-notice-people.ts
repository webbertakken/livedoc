// Who a text document's notification email may reach (docs/specs/034-text-documents/review.md "Notifications", Who is
// emailed): read when the email is sent, so a person lowered to Viewer, or whose link has gone, is reached by nothing
// from that moment. And the hourly cap on how many such emails one person is sent.
import { parseStoredLevel, type AccessLevel } from '@livedoc/api-schema';
import type { Env } from '../types';
import { VISIBLE_DOCUMENTS_CTES } from './document-visibility';

/** How a person reaches a document now: their level, the one tab their link opens (null: every tab), and the link
 *  itself (null for their own or their team's), which their email's links carry. */
export type NoticeReach = {
  readonly level: AccessLevel;
  readonly scopeTabId: string | null;
  readonly shareCode: string | null;
};

/** How `ownerId` reaches the document now, as their own Explorer would list it; null when they cannot open it. */
export async function noticeReachOf(
  env: Env,
  documentId: string,
  ownerId: string,
  now: number,
): Promise<NoticeReach | null> {
  const row = await env.DB.prepare(
    `WITH ${VISIBLE_DOCUMENTS_CTES}
     SELECT share_level, scope_tab_id, share_code FROM visible WHERE id = ?3 LIMIT 1`,
  )
    .bind(ownerId, now, documentId)
    .first<{
      share_level: string | null;
      scope_tab_id: string | null;
      share_code: string | null;
    }>();
  if (!row) return null;
  return {
    level: parseStoredLevel(row.share_level),
    scopeTabId: row.scope_tab_id,
    shareCode: row.share_code,
  };
}

/** Each identity's account: an identity an account was once (a guest id it took over) as that account. */
export async function accountsOfIdentities(
  env: Env,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const accounts = new Map(ids.map((id) => [id, id]));
  if (ids.length === 0) return accounts;
  const { results } = await env.DB.prepare(
    `SELECT alias_id, owner_id FROM owner_aliases
      WHERE alias_id IN (SELECT value FROM json_each(?)) ORDER BY created_at`,
  )
    .bind(JSON.stringify(ids))
    .all<{ alias_id: string; owner_id: string }>();
  for (const row of results ?? []) accounts.set(row.alias_id, row.owner_id);
  return accounts;
}

/** True when this email may go to `ownerId`: fewer than `perHour` sent them in the hour before `now`; the send is
 *  counted in the same statement, so two rooms cannot both slip under the cap. */
export async function claimNoticeEmail(
  env: Env,
  ownerId: string,
  now: number,
  perHour: number,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `INSERT INTO text_document_notice_sends (owner_id, sent_at)
     SELECT ?1, ?2
      WHERE (SELECT COUNT(*) FROM text_document_notice_sends WHERE owner_id = ?1 AND sent_at > ?3) < ?4`,
  )
    .bind(ownerId, now, now - HOUR_MS, perHour)
    .run();
  return res.meta.changes === 1;
}

const HOUR_MS = 60 * 60 * 1000;

/** Daily retention: a send past its hour counts against nothing. */
export async function deleteOldNoticeSends(env: Env, cutoffMs: number): Promise<number> {
  const res = await env.DB.prepare('DELETE FROM text_document_notice_sends WHERE sent_at < ?')
    .bind(cutoffMs)
    .run();
  return res.meta.changes ?? 0;
}

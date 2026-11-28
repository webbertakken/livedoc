// A copy shared with the same people (docs/specs/034-text-documents/files-and-print.md "Make a copy"): the source's
// active links become new links of the copy at the same level, and every signed-in person the source lists as shared
// with through a live link finds the copy under Shared with you at their level. Never the source's codes; no one told.
import { legacyRoleColumn, levelColumn, storedLevelOf } from '../share-link-row';
import type { Env } from '../types';
import { expiresAtFor, generateShareCode } from './share';
import { visitLinkSql } from './visit-link';
import type { ShareLinkExpiry } from '@livedoc/api-schema';

export type CopySharing = {
  sourceId: string;
  copyId: string;
  // Who made the copy: the source's owner, never carried as a person of their own copy.
  copier: string;
  // The two documents' tabs in order: a link to one tab is scoped to the copy's tab in the same place.
  sourceTabIds: readonly string[];
  copyTabIds: readonly string[];
};

export type CopySharingCounts = {
  links: number;
  linksSkipped: number;
  people: number;
  peopleSkipped: number;
};

type LinkRow = {
  code: string;
  role: string;
  level: string | null;
  expiry: string | null;
  tab_id: string | null;
};

type PersonRow = {
  owner_id: string;
  role: string;
  level: string | null;
  tab_id: string | null;
  live_code: string | null;
  signed_in: number;
};

const expiryOf = (value: string | null): ShareLinkExpiry =>
  value === 'week' || value === 'month' || value === 'sixMonths' ? value : 'never';

export async function shareCopyLikeSource(
  env: Env,
  sharing: CopySharing,
): Promise<CopySharingCounts> {
  const { sourceId, copyId, copier, sourceTabIds, copyTabIds } = sharing;
  const now = Date.now();
  const tabOf = new Map(
    sourceTabIds.flatMap((id, i) => (copyTabIds[i] === undefined ? [] : [[id, copyTabIds[i]]])),
  );
  const links = await env.DB.prepare(
    `SELECT l.code, l.role, l.level, l.expiry, l.tab_id FROM share_links l
       JOIN documents d ON d.id = l.document_id AND d.shareable = 1
      WHERE l.document_id = ? AND (l.expires_at IS NULL OR l.expires_at > ?) ORDER BY l.created_at ASC`,
  )
    .bind(sourceId, now)
    .all<LinkRow>();
  // A document no longer shared has no active link. The source's code to the copy's: only links carried, so a visit through any other is left out.
  const carried = new Map<string, { code: string; tabId: string | null }>();
  const statements: D1PreparedStatement[] = [];
  let linksSkipped = 0;
  for (const link of links.results ?? []) {
    const tabId = link.tab_id === null ? null : (tabOf.get(link.tab_id) ?? undefined);
    if (tabId === undefined) {
      linksSkipped++;
      continue;
    }
    const level = storedLevelOf(link);
    const expiry = expiryOf(link.expiry);
    const code = generateShareCode();
    carried.set(link.code, { code, tabId });
    statements.push(
      env.DB.prepare(
        'INSERT INTO share_links (code, document_id, role, level, created_at, expiry, expires_at, tab_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        code,
        copyId,
        legacyRoleColumn(level),
        levelColumn(level),
        now,
        expiry === 'never' ? null : expiry,
        expiresAtFor(expiry, now),
        tabId,
      ),
    );
  }
  const people = await env.DB.prepare(
    `SELECT s.owner_id, s.role, s.level, s.tab_id, ${visitLinkSql('?2')} AS live_code,
            EXISTS (SELECT 1 FROM identity_users u WHERE u.id = s.owner_id) AS signed_in
       FROM shared_with s
       JOIN documents d ON d.id = s.document_id
      WHERE s.document_id = ?1 AND d.shareable = 1 AND s.owner_id != ?3`,
  )
    .bind(sourceId, now, copier)
    .all<PersonRow>();
  let carriedPeople = 0;
  let peopleSkipped = 0;
  for (const person of people.results ?? []) {
    const link = person.live_code === null ? undefined : carried.get(person.live_code);
    if (!link || person.signed_in !== 1) {
      peopleSkipped++;
      continue;
    }
    // The visit's level is its link's (visitLinkSql matches them), so the row never reads above it.
    const level = storedLevelOf(person);
    carriedPeople++;
    statements.push(
      env.DB.prepare(
        'INSERT OR IGNORE INTO shared_with (owner_id, document_id, role, level, last_seen, tab_id, share_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        person.owner_id,
        copyId,
        legacyRoleColumn(level),
        levelColumn(level),
        now,
        link.tabId,
        link.code,
      ),
    );
  }
  if (carried.size > 0) {
    statements.push(
      env.DB.prepare(
        `UPDATE documents SET shareable = 1,
                share_password = (SELECT share_password FROM documents WHERE id = ?2)
          WHERE id = ?1`,
      ).bind(copyId, sourceId),
    );
  }
  if (statements.length > 0) await env.DB.batch(statements);
  const counts = {
    links: carried.size,
    linksSkipped,
    people: carriedPeople,
    peopleSkipped,
  };
  console.info('[documents] copy shared', { source: sourceId, copy: copyId, ...counts });
  return counts;
}

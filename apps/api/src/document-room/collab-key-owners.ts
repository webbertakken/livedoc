// Whose adder key a text document's comment carries (docs/specs/013-workspace/inbox.md §2.7). A comment's author is
// the key the room made from their identity on the document (share-roles.md "Integrity"), which says whose it is
// without saying who; the Inbox matches identities. The push makes the keys of everyone who may have written on the
// document (its owner, its team's joined members, whoever opened its share links, and every identity those used to
// be) and keeps those that match, so a key is never turned into anyone the document does not already know.
import type { CollabIndexRows } from '@livedoc/document';
import { adderKeyFor } from '../adder-key';
import type { DocumentEnv } from '../types';

/** The most identities one push makes keys for; past it, the latest share visitors are tried first. */
export const KEY_OWNER_CANDIDATES_MAX = 5000;
/** Keys made at once. */
const KEY_BATCH = 64;

// The owner first, then the team's joined members, the share visitors by their latest visit, then the identities all of
// those used to be.
const CANDIDATES_SQL = `
  WITH people(id, rank, seen) AS (
    SELECT owner_id, 0, 0 FROM documents WHERE id = ?1
    UNION ALL
    SELECT tm.user_id, 1, 0 FROM team_members tm JOIN documents d ON d.team_id = tm.team_id
     WHERE d.id = ?1 AND tm.status = 'joined' AND tm.user_id IS NOT NULL
    UNION ALL
    SELECT owner_id, 2, last_seen FROM shared_with WHERE document_id = ?1
  ),
  everyone(id, rank, seen) AS (
    SELECT id, rank, seen FROM people
    UNION ALL
    SELECT a.alias_id, p.rank, p.seen FROM owner_aliases a JOIN people p ON a.owner_id = p.id
  )
  SELECT id FROM everyone GROUP BY id ORDER BY MIN(rank), MAX(seen) DESC LIMIT ?2`;

/** The keys the rows carry: their threads' authors and their actions' assigners. */
export function rowKeys(rows: CollabIndexRows): Set<string> {
  const keys = new Set<string>();
  for (const thread of rows.threads) for (const key of thread.participantIds) keys.add(key);
  for (const action of rows.actions) if (action.assignerId) keys.add(action.assignerId);
  return keys;
}

/** Each of `keys` the document's people make, to the identity that makes it; asks D1 nothing for no keys. */
export async function keyOwners(
  env: DocumentEnv,
  documentId: string,
  keys: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  if (keys.size === 0) return owners;
  const rows = await env.DB.prepare(CANDIDATES_SQL)
    .bind(documentId, KEY_OWNER_CANDIDATES_MAX)
    .all<{ id: string }>();
  const candidates = (rows.results ?? []).map((r) => r.id);
  for (let i = 0; i < candidates.length && owners.size < keys.size; i += KEY_BATCH) {
    const batch = candidates.slice(i, i + KEY_BATCH);
    const made = await Promise.all(batch.map((id) => adderKeyFor(documentId, id)));
    made.forEach((key, j) => {
      if (keys.has(key) && !owners.has(key)) owners.set(key, batch[j]!);
    });
  }
  return owners;
}

/** The rows with their keys turned into identities: an unknown author left out, an unknown assigner none. */
export function resolveCollabKeys(
  rows: CollabIndexRows,
  owners: ReadonlyMap<string, string>,
  teamId: string | null,
): CollabIndexRows {
  return {
    threads: rows.threads.map((t) => ({
      ...t,
      participantIds: t.participantIds.flatMap((key) => {
        const id = owners.get(key);
        return id ? [id] : [];
      }),
    })),
    actions: rows.actions.map((a) => ({
      ...a,
      assignerId: owners.get(a.assignerId) ?? '',
      teamId,
    })),
  };
}

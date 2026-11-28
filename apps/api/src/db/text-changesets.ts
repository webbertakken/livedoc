// text_changesets and text_changeset_parts (docs/specs/024-agents/agent-changesets.md "A text document's changesets"):
// one row per changeset beside its tab, its operations, result lines, undo step and threads beside it. Written after
// the room stored its update: the update is the change, the record its account.
import type { ChangesetCounts } from '@livedoc/api-schema';
import type { DocumentEnv } from '../types';

export type TextChangesetPart = 'ops' | 'results' | 'step' | 'threads';

export type TextChangesetRecord = {
  id: string;
  documentId: string;
  tabId: string;
  documentTab: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  tokenId: string | null;
  summary: string | null;
  counts: ChangesetCounts;
  revertOf: string | null;
  revertedBy: string | null;
  createdAt: number;
};

type Row = {
  id: string;
  document_id: string;
  tab_id: string;
  document_tab: string;
  author_id: string;
  author_name: string;
  author_color: string;
  token_id: string | null;
  summary: string | null;
  added: number;
  changed: number;
  revert_of: string | null;
  reverted_by: string | null;
  created_at: number;
};

const COLUMNS = `id, document_id, tab_id, document_tab, author_id, author_name, author_color, token_id, summary, added,
  changed, revert_of, reverted_by, created_at`;

function recordOf(row: Row): TextChangesetRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    tabId: row.tab_id,
    documentTab: row.document_tab,
    authorId: row.author_id,
    authorName: row.author_name,
    authorColor: row.author_color,
    tokenId: row.token_id,
    summary: row.summary,
    counts: { added: row.added, changed: row.changed, removed: 0 },
    revertOf: row.revert_of,
    revertedBy: row.reverted_by,
    createdAt: row.created_at,
  };
}

/** The record and its parts in one batch; a revert's also marks the changeset it reverts. */
export async function insertTextChangeset(
  env: DocumentEnv,
  r: TextChangesetRecord,
  parts: Record<TextChangesetPart, string>,
): Promise<void> {
  const statements = [
    env.DOCUMENT_DB.prepare(
      `INSERT INTO text_changesets (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      r.id,
      r.documentId,
      r.tabId,
      r.documentTab,
      r.authorId,
      r.authorName,
      r.authorColor,
      r.tokenId,
      r.summary,
      r.counts.added,
      r.counts.changed,
      r.revertOf,
      r.revertedBy,
      r.createdAt,
    ),
    ...(Object.entries(parts) as [TextChangesetPart, string][]).map(([part, data]) =>
      env.DOCUMENT_DB.prepare(
        'INSERT INTO text_changeset_parts (changeset_id, part, data) VALUES (?, ?, ?)',
      ).bind(r.id, part, data),
    ),
  ];
  if (r.revertOf)
    statements.push(
      env.DOCUMENT_DB.prepare(
        'UPDATE text_changesets SET reverted_by = ? WHERE id = ? AND document_id = ?',
      ).bind(r.id, r.revertOf, r.documentId),
    );
  await env.DOCUMENT_DB.batch(statements);
}

export async function getTextChangeset(
  env: DocumentEnv,
  documentId: string,
  id: string,
): Promise<TextChangesetRecord | null> {
  const row = await env.DOCUMENT_DB.prepare(
    `SELECT ${COLUMNS} FROM text_changesets WHERE id = ? AND document_id = ?`,
  )
    .bind(id, documentId)
    .first<Row>();
  return row ? recordOf(row) : null;
}

export async function getTextChangesetParts(
  env: DocumentEnv,
  id: string,
): Promise<Partial<Record<TextChangesetPart, string>>> {
  const rows = await env.DOCUMENT_DB.prepare(
    'SELECT part, data FROM text_changeset_parts WHERE changeset_id = ?',
  )
    .bind(id)
    .all<{ part: TextChangesetPart; data: string }>();
  return Object.fromEntries((rows.results ?? []).map((r) => [r.part, r.data]));
}

// A document's text changesets, newest first; a tab's only when named.
export async function listTextChangesets(
  env: DocumentEnv,
  documentId: string,
  opts: { tabId?: string; limit: number },
): Promise<TextChangesetRecord[]> {
  const byTab = opts.tabId !== undefined;
  const rows = await env.DOCUMENT_DB.prepare(
    `SELECT ${COLUMNS} FROM text_changesets
      WHERE document_id = ?${byTab ? ' AND tab_id = ?' : ''}
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
  )
    .bind(...(byTab ? [documentId, opts.tabId, opts.limit] : [documentId, opts.limit]))
    .all<Row>();
  return (rows.results ?? []).map(recordOf);
}

// The room's retention sweep (CS28): records older than the cutoff; their parts follow by cascade.
export async function deleteOldTextChangesets(env: DocumentEnv, cutoff: number): Promise<number> {
  const res = await env.DOCUMENT_DB.prepare('DELETE FROM text_changesets WHERE created_at < ?')
    .bind(cutoff)
    .run();
  return res.meta.changes ?? 0;
}

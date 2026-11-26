// sheet_changesets and sheet_changeset_parts (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D265):
// one row per changeset beside its sheet, its writes, inverse and after-image beside it. Written in the changeset's
// own batch, each insert guarded by the sheet's write nonce, so a lost race records nothing.
import type { ChangesetCounts } from '@livedoc/api-schema';
import type { DocumentEnv } from '../types';

export type SheetChangesetPart = 'writes' | 'inverse' | 'after';

export type SheetChangesetRecord = {
  id: string;
  documentId: string;
  sheetId: string;
  tabId: string;
  rev: number;
  previousRev: number;
  authorId: string;
  authorName: string;
  authorColor: string;
  tokenId: string | null;
  summary: string | null;
  counts: ChangesetCounts;
  revertOf: string | null;
  createdAt: number;
};

type Row = {
  id: string;
  document_id: string;
  sheet_id: string;
  tab_id: string;
  rev: number;
  previous_rev: number;
  author_id: string;
  author_name: string;
  author_color: string;
  token_id: string | null;
  summary: string | null;
  added: number;
  changed: number;
  removed: number;
  revert_of: string | null;
  created_at: number;
};

const COLUMNS = `id, document_id, sheet_id, tab_id, rev, previous_rev, author_id, author_name, author_color, token_id,
  summary, added, changed, removed, revert_of, created_at`;

// Only when the sheet holds the batch's own nonce: the head's raise landed.
const LANDED = 'EXISTS (SELECT 1 FROM sheets WHERE document_id = ? AND id = ? AND write_nonce = ?)';

function recordOf(row: Row): SheetChangesetRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    sheetId: row.sheet_id,
    tabId: row.tab_id,
    rev: row.rev,
    previousRev: row.previous_rev,
    authorId: row.author_id,
    authorName: row.author_name,
    authorColor: row.author_color,
    tokenId: row.token_id,
    summary: row.summary,
    counts: { added: row.added, changed: row.changed, removed: row.removed },
    revertOf: row.revert_of,
    createdAt: row.created_at,
  };
}

export function insertSheetChangesetStatements(
  env: DocumentEnv,
  r: SheetChangesetRecord,
  nonce: string,
  parts: Record<SheetChangesetPart, string>,
): D1PreparedStatement[] {
  const guard = [r.documentId, r.sheetId, nonce];
  return [
    env.DOCUMENT_DB.prepare(
      `INSERT INTO sheet_changesets (${COLUMNS})
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${LANDED}`,
    ).bind(
      r.id,
      r.documentId,
      r.sheetId,
      r.tabId,
      r.rev,
      r.previousRev,
      r.authorId,
      r.authorName,
      r.authorColor,
      r.tokenId,
      r.summary,
      r.counts.added,
      r.counts.changed,
      r.counts.removed,
      r.revertOf,
      r.createdAt,
      ...guard,
    ),
    ...(Object.entries(parts) as [SheetChangesetPart, string][]).map(([part, data]) =>
      env.DOCUMENT_DB.prepare(
        `INSERT INTO sheet_changeset_parts (changeset_id, part, data) SELECT ?, ?, ? WHERE ${LANDED}`,
      ).bind(r.id, part, data, ...guard),
    ),
  ];
}

export async function getSheetChangeset(
  env: DocumentEnv,
  documentId: string,
  id: string,
): Promise<SheetChangesetRecord | null> {
  const row = await env.DOCUMENT_DB.prepare(
    `SELECT ${COLUMNS} FROM sheet_changesets WHERE id = ? AND document_id = ?`,
  )
    .bind(id, documentId)
    .first<Row>();
  return row ? recordOf(row) : null;
}

export async function getSheetChangesetParts(
  env: DocumentEnv,
  id: string,
): Promise<Partial<Record<SheetChangesetPart, string>>> {
  const rows = await env.DOCUMENT_DB.prepare(
    'SELECT part, data FROM sheet_changeset_parts WHERE changeset_id = ?',
  )
    .bind(id)
    .all<{ part: SheetChangesetPart; data: string }>();
  return Object.fromEntries((rows.results ?? []).map((r) => [r.part, r.data]));
}

// A document's sheet changesets, newest first; a tab's only when named.
export async function listSheetChangesets(
  env: DocumentEnv,
  documentId: string,
  opts: { tabId?: string; limit: number },
): Promise<SheetChangesetRecord[]> {
  const byTab = opts.tabId !== undefined;
  const rows = await env.DOCUMENT_DB.prepare(
    `SELECT ${COLUMNS} FROM sheet_changesets
      WHERE document_id = ?${byTab ? ' AND tab_id = ?' : ''}
      ORDER BY created_at DESC, rev DESC
      LIMIT ?`,
  )
    .bind(...(byTab ? [documentId, opts.tabId, opts.limit] : [documentId, opts.limit]))
    .all<Row>();
  return (rows.results ?? []).map(recordOf);
}

// The room's retention sweep (CS28): records older than the cutoff; their parts follow by cascade.
export async function deleteOldSheetChangesets(env: DocumentEnv, cutoff: number): Promise<number> {
  const res = await env.DOCUMENT_DB.prepare('DELETE FROM sheet_changesets WHERE created_at < ?')
    .bind(cutoff)
    .run();
  return res.meta.changes ?? 0;
}

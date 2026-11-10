// The content summary built in the room (docs/specs/006-document/document-storage.md "The content
// summary"), from its own tables: the D1-era list subqueries (the first tab's count, documentStatsSql) and the empty
// clean-up's test, moved here unchanged. Pushed to D1 by the outbox's document unit and answered by `create`.

import type { ContentSummary } from '../db/content-summary';
import { documentStatsSql, readDocumentStats } from '../db/tab-stats';
import type { DocumentEnv } from '../types';

// A tab holds content (docs/specs/013-workspace/empty-document-cleanup.md): an element, an article, a form or a filled
// dashboard slot, as `tabHoldsContent` (@livedoc/document) asks it of one tab in the editor. A body that is not JSON
// fails safe as content. A CASE, so SQLite stops at the first match.
const HAS_CONTENT = `CASE
       WHEN NOT json_valid(t.data) THEN 1
       WHEN COALESCE(json_array_length(t.data, '$.elements'), 0) > 0 THEN 1
       WHEN EXISTS (SELECT 1 FROM json_each(t.data, '$.articles')) THEN 1
       WHEN json_type(t.data, '$.form') = 'object' THEN 1
       WHEN EXISTS (SELECT 1 FROM json_each(t.data, '$.dashboard.rows') r, json_each(r.value, '$.slots') s
                     WHERE json_type(s.value, '$.content') = 'object') THEN 1
       ELSE 0
     END`;

type TabCountRow = { tab_id: string; element_count: number; has_content: number };

export async function contentSummaryOf(
  env: DocumentEnv,
  documentId: string,
): Promise<ContentSummary> {
  const [tabs, stats] = await env.DOCUMENT_DB.batch([
    env.DOCUMENT_DB.prepare(
      `SELECT dt.tab_id, COALESCE(t.element_count, -1) AS element_count, ${HAS_CONTENT} AS has_content
         FROM document_tabs dt JOIN tabs t ON t.id = dt.tab_id
        WHERE dt.document_id = ?
        ORDER BY dt.order_index ASC`,
    ).bind(documentId),
    env.DOCUMENT_DB.prepare(`SELECT ${documentStatsSql('?1')}`).bind(documentId),
  ]);
  const rows = (tabs?.results ?? []) as TabCountRow[];
  const tabCounts: Record<string, number> = {};
  for (const row of rows) tabCounts[row.tab_id] = row.element_count;
  const raw = (stats?.results?.[0] as { doc_stats?: string | null } | undefined)?.doc_stats;
  return {
    v: 1,
    tabs: rows.length,
    firstTabCount: rows[0] ? rows[0].element_count : null,
    tabCounts,
    stats: readDocumentStats(raw ?? null),
    hasContent: rows.some((r) => r.has_content === 1),
  };
}

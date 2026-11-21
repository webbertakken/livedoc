// The content summary built in the room (docs/specs/006-document/document-storage.md "The content
// summary"), from its own tables: the D1-era list subqueries (the first tab's count, documentStatsSql) and the empty
// clean-up's test, moved here unchanged. Pushed to D1 by the outbox's document unit and answered by `create`.
// In a spreadsheet a sheet tab's content is its sheet's filled cells, counted where a tab counts its elements; a text
// document's is its characters, from its digest (docs/specs/034-text-documents/live-editing-and-storage.md "The digest").

import type { ContentSummary } from '../db/content-summary';
import { documentStatsSql, readDocumentStats } from '../db/tab-stats';
import type { DocumentEnv } from '../types';
import { LIVE_TAB_KINDS } from '../live-tabs/live-tab-kinds';

// A live tab holds content when its digest says so, whatever its kind (kinds-outside-the-canvas.md "Live state").
const LIVE_TAB_HAS_CONTENT = LIVE_TAB_KINDS.map(
  (k) =>
    `       WHEN EXISTS (SELECT 1 FROM ${k.tables.digest} d WHERE d.tab_id = t.id AND d.has_content = 1) THEN 1\n`,
).join('');

// Every live tab's digest counts, of every kind, for the document's tabs.
const LIVE_TAB_ROWS = LIVE_TAB_KINDS.map(
  (k) => `SELECT d.tab_id, d.characters, d.state_bytes
         FROM ${k.tables.digest} d JOIN document_tabs dt ON dt.tab_id = d.tab_id
        WHERE dt.document_id = ?1`,
).join('\n UNION ALL ');

// A tab holds content (docs/specs/013-workspace/empty-document-cleanup.md): an element, an article, a form or a filled
// dashboard slot, as `tabHoldsContent` (@livedoc/document) asks it of one tab in the editor. A body that is not JSON
// fails safe as content. A CASE, so SQLite stops at the first match.
const HAS_CONTENT = `CASE
       WHEN NOT json_valid(t.data) THEN 1
       WHEN COALESCE(json_array_length(t.data, '$.elements'), 0) > 0 THEN 1
       WHEN EXISTS (SELECT 1 FROM json_each(t.data, '$.articles')) THEN 1
       WHEN json_type(t.data, '$.form') = 'object' THEN 1
${LIVE_TAB_HAS_CONTENT}       WHEN EXISTS (SELECT 1 FROM json_each(t.data, '$.dashboard.rows') r, json_each(r.value, '$.slots') s
                     WHERE json_type(s.value, '$.content') = 'object') THEN 1
       ELSE 0
     END`;

type TabCountRow = { tab_id: string; element_count: number; has_content: number };
// A spreadsheet's sheet tab: its sheets' filled cells and their stored bytes.
type SheetTabRow = { tab_id: string; cells: number; bytes: number };
// A live tab (a text document's): its characters and its stored state's bytes, as its last digest counted them.
type LiveTabRow = { tab_id: string; characters: number; state_bytes: number };

export async function contentSummaryOf(
  env: DocumentEnv,
  documentId: string,
): Promise<ContentSummary> {
  const [tabs, stats, sheetTabs, textDocumentTabs] = await env.DOCUMENT_DB.batch([
    env.DOCUMENT_DB.prepare(
      `SELECT dt.tab_id, COALESCE(t.element_count, -1) AS element_count, ${HAS_CONTENT} AS has_content
         FROM document_tabs dt JOIN tabs t ON t.id = dt.tab_id
        WHERE dt.document_id = ?
        ORDER BY dt.order_index ASC`,
    ).bind(documentId),
    env.DOCUMENT_DB.prepare(`SELECT ${documentStatsSql('?1')}`).bind(documentId),
    // Only a spreadsheet's, and only sheets on a tab the document holds (a deleted tab's waits to expire).
    env.DOCUMENT_DB.prepare(
      `SELECT s.tab_id, SUM(s.cell_count) AS cells, SUM(s.cell_bytes) AS bytes
         FROM sheets s JOIN document_tabs dt ON dt.document_id = s.document_id AND dt.tab_id = s.tab_id
        WHERE s.document_id = ?1 AND EXISTS (SELECT 1 FROM workbook w WHERE w.document_id = ?1)
        GROUP BY s.tab_id`,
    ).bind(documentId),
    env.DOCUMENT_DB.prepare(LIVE_TAB_ROWS).bind(documentId),
  ]);
  const rows = (tabs?.results ?? []) as TabCountRow[];
  const sheets = new Map(((sheetTabs?.results ?? []) as SheetTabRow[]).map((r) => [r.tab_id, r]));
  const texts = new Map(
    ((textDocumentTabs?.results ?? []) as LiveTabRow[]).map((r) => [r.tab_id, r]),
  );
  const countOf = (row: TabCountRow): number => {
    const sheet = sheets.get(row.tab_id);
    return sheet ? sheet.cells : (texts.get(row.tab_id)?.characters ?? row.element_count);
  };
  const tabCounts: Record<string, number> = {};
  for (const row of rows) tabCounts[row.tab_id] = countOf(row);
  const raw = (stats?.results?.[0] as { doc_stats?: string | null } | undefined)?.doc_stats;
  return {
    v: 1,
    tabs: rows.length,
    firstTabCount: rows[0] ? countOf(rows[0]) : null,
    tabCounts,
    stats: withText(withCells(readDocumentStats(raw ?? null), [...sheets.values()]), [
      ...texts.values(),
    ]),
    hasContent: rows.some((r) => r.has_content === 1 || (sheets.get(r.tab_id)?.cells ?? 0) > 0),
  };
}

// A spreadsheet's stats: its filled cells are its elements, and their bytes join the tabs'.
function withCells(
  stats: ContentSummary['stats'],
  sheets: readonly SheetTabRow[],
): ContentSummary['stats'] {
  if (!stats || sheets.length === 0) return stats;
  let cells = 0;
  let bytes = 0;
  for (const s of sheets) {
    cells += s.cells;
    bytes += s.bytes;
  }
  return { ...stats, elements: cells, bytes: stats.bytes + bytes };
}

// A text document's stats: its characters join the elements, its stored state's bytes the tabs'.
function withText(
  stats: ContentSummary['stats'],
  texts: readonly LiveTabRow[],
): ContentSummary['stats'] {
  if (!stats || texts.length === 0) return stats;
  let characters = 0;
  let bytes = 0;
  for (const t of texts) {
    characters += t.characters;
    bytes += t.state_bytes;
  }
  return { ...stats, elements: stats.elements + characters, bytes: stats.bytes + bytes };
}

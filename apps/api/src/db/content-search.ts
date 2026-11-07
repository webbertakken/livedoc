// Content search's D1 side (docs/specs/013-workspace/content-search.md,
// docs/specs/013-workspace/content-search.md): the index rows a room's drain writes, and the
// access-filtered read. The only module naming `content_search` outside the migration.
//
// Matching: each query word of 3 characters or more matches by its trigrams, OR-ed into one FTS5 query over the
// trigram index (accents folded by the tokenizer); a tab is kept when, for every such word, at least half of its
// trigrams occur in the tab's folded text, and every shorter word starts one of its words. Ranked by bm25.

import { foldSearchText, searchQueryWords } from '@livedoc/explorer-lens';
import { VISIBLE_DOCUMENTS_CTES } from './document-visibility';
import type { Env } from '../types';

/** The cut on one tab's search text, in UTF-16 units (spec: 32,768 characters). */
export const SEARCH_TEXT_MAX_CHARS = 32_768;
/** The longest query read, as the lens's own cap. */
export const SEARCH_QUERY_MAX_CHARS = 512;
/** The most trigrams one query matches with, in word order. */
export const SEARCH_TRIGRAMS_MAX = 32;
/** The least share of a word's trigrams a tab must hold for the word to count as found. */
export const SEARCH_MIN_TRIGRAM_SHARE = 0.5;
/** The most documents one search answers. */
export const SEARCH_RESULTS_MAX = 50;
/** FTS candidates ranked by bm25 before the share filter. */
export const SEARCH_CANDIDATES = 500;
/** The longest snippet line answered. */
export const SNIPPET_MAX_CHARS = 160;
/** The tab key of a document's cards. */
export const ITEMS_SEARCH_KEY = '~items';

export type ContentQuery = {
  long: { word: string; trigrams: string[] }[];
  short: string[];
  /** Every kept trigram, deduplicated, in word order. */
  trigrams: string[];
};

export type ContentMatch = {
  documentId: string;
  tabId: string | null;
  tabName: string | null;
  snippet: { text: string; marks: [number, number][] };
};

/** A query's words split into trigram words and short words, its trigrams capped at SEARCH_TRIGRAMS_MAX. */
export function compileContentQuery(q: string): ContentQuery {
  const words = searchQueryWords(q.slice(0, SEARCH_QUERY_MAX_CHARS));
  const seen = new Set<string>();
  const long: ContentQuery['long'] = [];
  const short: string[] = [];
  for (const word of words) {
    const chars = Array.from(word);
    if (chars.length < 3) {
      if (!short.includes(word)) short.push(word);
      continue;
    }
    const trigrams: string[] = [];
    for (let i = 0; i + 3 <= chars.length; i++) {
      const t = chars.slice(i, i + 3).join('');
      if (seen.has(t)) {
        if (!trigrams.includes(t)) trigrams.push(t);
        continue;
      }
      if (seen.size >= SEARCH_TRIGRAMS_MAX) break;
      seen.add(t);
      trigrams.push(t);
    }
    if (trigrams.length > 0) long.push({ word, trigrams });
  }
  return { long, short, trigrams: [...seen] };
}

/** A search text cut at the cap, never leaving half a surrogate pair. */
export function capSearchText(text: string): { text: string; capped: boolean } {
  if (text.length <= SEARCH_TEXT_MAX_CHARS) return { text, capped: false };
  let end = SEARCH_TEXT_MAX_CHARS;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return { text: text.slice(0, end), capped: true };
}

const EXISTS_DOCUMENT = 'EXISTS (SELECT 1 FROM documents WHERE id = ?1)';

/**
 * The statements that set one tab's (or the cards', under ITEMS_SEARCH_KEY) search text: an upsert that rewrites only
 * when the text or name changed, or a delete when the text is empty or the tab gone (`text` null).
 */
export function contentSearchStatements(
  env: Pick<Env, 'DB'>,
  documentId: string,
  tabId: string,
  tabName: string,
  text: string | null,
): D1PreparedStatement[] {
  if (text === null || text.trim() === '') {
    return [
      env.DB.prepare('DELETE FROM content_search WHERE document_id = ?1 AND tab_id = ?2').bind(
        documentId,
        tabId,
      ),
    ];
  }
  const capped = capSearchText(text);
  console.log(
    `[content-search] indexed id=${documentId} tab=${tabId} chars=${capped.text.length} capped=${capped.capped}`,
  );
  return [
    env.DB.prepare(
      `INSERT INTO content_search (document_id, tab_id, tab_name, text, folded)
       SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${EXISTS_DOCUMENT}
       ON CONFLICT (document_id, tab_id) DO UPDATE SET
         tab_name = excluded.tab_name, text = excluded.text, folded = excluded.folded
       WHERE content_search.text IS NOT excluded.text OR content_search.tab_name IS NOT excluded.tab_name`,
    ).bind(documentId, tabId, tabName, capped.text, foldSearchText(capped.text)),
  ];
}

/** A snippet cut to at most `max` characters around its first mark, at word boundaries, with ellipses. */
export function trimSnippet(
  snippet: { text: string; marks: [number, number][] },
  max = SNIPPET_MAX_CHARS,
): { text: string; marks: [number, number][] } {
  const { text, marks } = snippet;
  const flat = text.replace(/\s+/g, ' ');
  if (flat.length <= max) return { text: flat, marks };
  const focus = marks[0]?.[0] ?? 0;
  let start = Math.max(0, Math.min(focus - Math.floor(max / 3), flat.length - max));
  let end = Math.min(flat.length, start + max);
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    if (space !== -1 && space < focus) start = space + 1;
  }
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end);
    if (space > start && space > (marks[0]?.[1] ?? focus)) end = space;
  }
  const lead = start > 0 && !flat.slice(0, start).endsWith('…') ? '…' : '';
  const tail = end < flat.length && !flat.slice(end).startsWith('…') ? '…' : '';
  const shift = lead.length - start;
  return {
    text: `${lead}${flat.slice(start, end)}${tail}`,
    marks: marks
      .filter(([a, b]) => a >= start && b <= end)
      .map(([a, b]) => [a + shift, b + shift] as [number, number]),
  };
}

/** Whether a folded text word answers a query word: a short word starts it; a long one has at least the minimum
 *  share of its trigrams in it (the read's own rule, word by word). */
function wordAnswers(folded: string, query: ContentQuery): number {
  for (const w of query.short) if (folded.startsWith(w)) return w.length;
  for (const { trigrams } of query.long) {
    const found = trigrams.filter((t) => folded.includes(t)).length;
    if (found > 0 && found >= SEARCH_MIN_TRIGRAM_SHARE * trigrams.length) return folded.length;
  }
  return 0;
}

/** A line of `text` around the first word that answers the query, every answering word in the line marked. SQLite's
 *  snippet() would mark trigram fragments and walks every candidate's text (measured over 2,000 rows of 8 KB: 547 ms
 *  against 21 ms without it), so the line is cut here from the answered rows' text. */
export function snippetAround(
  text: string,
  query: ContentQuery,
): { text: string; marks: [number, number][] } {
  const marks: [number, number][] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const length = wordAnswers(foldSearchText(m[0]), query);
    if (length > 0) marks.push([m.index, m.index + Math.min(length, m[0].length)]);
    if (marks.length > 0 && m.index > marks[0]![0] + SNIPPET_MAX_CHARS) break;
  }
  return trimSnippet({ text, marks });
}

type Row = { document_id: string; tab_id: string; tab_name: string; snip: string };

function toMatch(row: Row, snippet: { text: string; marks: [number, number][] }): ContentMatch {
  const items = row.tab_id === ITEMS_SEARCH_KEY;
  return {
    documentId: row.document_id,
    tabId: items ? null : row.tab_id,
    tabName: items ? null : row.tab_name,
    snippet,
  };
}

const SCOPE = '(v.scope_tab_id IS NULL OR v.scope_tab_id = s.tab_id)';
const SHORT_WORDS_START =
  "NOT EXISTS (SELECT 1 FROM json_each(?4) w WHERE instr(' ' || s.folded, ' ' || w.value) = 0)";

const TRIGRAM_SEARCH = `
WITH ${VISIBLE_DOCUMENTS_CTES},
hits AS (
  SELECT s.document_id, s.tab_id, s.tab_name, s.text, s.folded, v.saved_at,
         bm25(content_search_fts) AS rank
    FROM content_search_fts
    JOIN content_search s ON s.rowid = content_search_fts.rowid
    JOIN visible v ON v.id = s.document_id
   WHERE content_search_fts MATCH ?3 AND ${SCOPE} AND ${SHORT_WORDS_START}
   ORDER BY rank
   LIMIT ${SEARCH_CANDIDATES}
),
kept AS (
  SELECT h.*, (SELECT count(*) FROM json_each(?6) t WHERE instr(h.folded, t.value) > 0) AS matched
    FROM hits h
   WHERE NOT EXISTS (
     SELECT 1 FROM json_each(?5) w
      WHERE (SELECT count(*) FROM json_each(w.value) t WHERE instr(h.folded, t.value) > 0)
            < ${SEARCH_MIN_TRIGRAM_SHARE} * json_array_length(w.value))
),
ranked AS (
  SELECT k.*, ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY rank, matched DESC) AS n FROM kept k
)
SELECT document_id, tab_id, tab_name, text AS snip FROM ranked WHERE n = 1
 ORDER BY rank, matched DESC, saved_at DESC
 LIMIT ${SEARCH_RESULTS_MAX}`;

const SHORT_SEARCH = `
WITH ${VISIBLE_DOCUMENTS_CTES},
rows AS (
  SELECT s.document_id, s.tab_id, s.tab_name, s.text AS snip, v.saved_at,
         ROW_NUMBER() OVER (PARTITION BY s.document_id ORDER BY s.tab_id) AS n
    FROM content_search s
    JOIN visible v ON v.id = s.document_id
   WHERE ${SCOPE} AND ${SHORT_WORDS_START}
)
SELECT document_id, tab_id, tab_name, snip FROM rows WHERE n = 1
 ORDER BY saved_at DESC
 LIMIT ${SEARCH_RESULTS_MAX}`;

/** The documents `owner` may open whose content matches `q`, best first; one match per document. */
export async function searchContent(
  env: Pick<Env, 'DB'>,
  owner: string,
  q: string,
  now: number,
): Promise<ContentMatch[]> {
  const query = compileContentQuery(q);
  if (query.long.length === 0 && query.short.length === 0) return [];
  const started = Date.now();
  const shortJson = JSON.stringify(query.short);
  let matches: ContentMatch[];
  if (query.long.length > 0) {
    const match = query.trigrams.map((t) => `"${t}"`).join(' OR ');
    const { results } = await env.DB.prepare(TRIGRAM_SEARCH)
      .bind(
        owner,
        now,
        match,
        shortJson,
        JSON.stringify(query.long.map((w) => w.trigrams)),
        JSON.stringify(query.trigrams),
      )
      .all<Row>();
    matches = results.map((r) => toMatch(r, snippetAround(r.snip, query)));
  } else {
    const { results } = await env.DB.prepare(SHORT_SEARCH)
      .bind(owner, now, null, shortJson)
      .all<Row>();
    matches = results.map((r) => toMatch(r, snippetAround(r.snip, query)));
  }
  console.log(
    `[content-search] query words=${query.long.length + query.short.length} trigrams=${query.trigrams.length} matches=${matches.length} ms=${Date.now() - started}`,
  );
  return matches;
}

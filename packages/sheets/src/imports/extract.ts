// A fetched page read as an import asks (docs/specs/029-sheets/imports.md "The functions"): the rows of text the api
// answers with, or the failure. Pure, run by the api Worker on what it fetched; the engine types the text.
import { parseCsv } from '../csv';
import { feedRows, readFeed } from './feed';
import {
  boundedRows,
  IMPORT_WORDS,
  type WebImportAnswer,
  type WebImportRequest,
} from './import-request';
import {
  attrOf,
  elementsOf,
  parseMarkup,
  shownTextOf,
  type MarkupElement,
  type MarkupNode,
} from './markup';
import { evaluateXPath, numberText, type XNode } from './xpath-eval';
import { parseXPath } from './xpath-parse';

/** A page as fetched: its text, its content type (empty when none) and its final address. */
export type FetchedPage = { text: string; type: string; url: string };

// The most columns or rows one cell may span: HTML's own ceilings are 1,000 and 65,534; the answer's bound still holds.
const SPAN_MAX = 1_000;

const empty = (): WebImportAnswer => ({ error: '#N/A', why: IMPORT_WORDS.empty });

export function isTabSeparated(page: FetchedPage): boolean {
  if (/text\/tab-separated-values/i.test(page.type)) return true;
  try {
    return new URL(page.url).pathname.toLowerCase().endsWith('.tsv');
  } catch {
    return false;
  }
}

export function isXml(page: FetchedPage): boolean {
  if (/html/i.test(page.type)) return false;
  return /[/+]xml\b/i.test(page.type) || page.text.trimStart().startsWith('<?xml');
}

// The elements of `kind` under `scope`, not those inside a nested element of `stop` (a table's own rows).
function ownOf(scope: MarkupElement, kind: Set<string>, stop: string): MarkupElement[] {
  const out: MarkupElement[] = [];
  const stack: MarkupNode[] = [...scope.children].reverse();
  while (stack.length > 0) {
    const x = stack.pop()!;
    if (x.kind !== 'element') continue;
    if (kind.has(x.name)) out.push(x);
    if (x.name === stop) continue;
    for (let i = x.children.length - 1; i >= 0; i--) stack.push(x.children[i]!);
  }
  return out;
}

function span(el: MarkupElement, name: string): number {
  const n = Number.parseInt(attrOf(el, name) ?? '1', 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, SPAN_MAX) : 1;
}

// A table's rows of cells, each spanning cell's text in its first place and the rest left empty (D62).
export function tableRows(table: MarkupElement): string[][] {
  const rows: string[][] = [];
  // Places taken by a cell spanning down from a row above: row -> columns.
  const taken = new Map<number, Set<number>>();
  ownOf(table, new Set(['tr']), 'table').forEach((tr, r) => {
    const row: string[] = rows[r] ?? [];
    rows[r] = row;
    let c = 0;
    for (const cell of ownOf(tr, new Set(['td', 'th']), 'table')) {
      while (taken.get(r)?.has(c)) c++;
      const across = span(cell, 'colspan');
      const down = span(cell, 'rowspan');
      for (let dr = 0; dr < down; dr++)
        for (let dc = 0; dc < across; dc++) {
          if (dr === 0 && dc === 0) continue;
          let set = taken.get(r + dr);
          if (!set) taken.set(r + dr, (set = new Set()));
          set.add(c + dc);
        }
      row[c] = shownTextOf(cell);
      c += across;
    }
  });
  return rows.map((row) => Array.from(row, (t) => t ?? ''));
}

function htmlRows(root: MarkupElement, query: 'table' | 'list', index: number): string[][] | null {
  const lists = new Set(query === 'table' ? ['table'] : ['ul', 'ol']);
  const found = elementsOf(root).filter((e) => lists.has(e.name))[index - 1];
  if (!found) return null;
  if (query === 'table') return tableRows(found);
  return ownOf(found, new Set(['li']), 'li').map((li) => [shownTextOf(li)]);
}

function nodeRow(n: XNode): string[] {
  if (n.kind === 'element') {
    const kids = n.children.filter((c) => c.kind === 'element');
    if (kids.length > 0) return kids.map((k) => shownTextOf(k));
  }
  return [shownTextOf(n)];
}

function xmlRows(page: FetchedPage, xpath: string): WebImportAnswer {
  const expr = parseXPath(xpath);
  if ('error' in expr) return { error: '#VALUE!', why: expr.error };
  const root = parseMarkup(page.text, isXml(page) ? 'xml' : 'html');
  const v = evaluateXPath(expr, root);
  if (typeof v === 'object' && 'error' in v) return { error: '#N/A', why: v.error };
  if (Array.isArray(v)) return v.length > 0 ? boundedRows(v.map(nodeRow)) : empty();
  const one =
    typeof v === 'number' ? numberText(v) : typeof v === 'boolean' ? String(v).toUpperCase() : v;
  return boundedRows([[one]]);
}

/** The rows an import answers from the page fetched for it, or why it gives none. */
export function extractImport(r: WebImportRequest, page: FetchedPage): WebImportAnswer {
  switch (r.kind) {
    case 'data': {
      if (page.text.trim() === '') return empty();
      return boundedRows(parseCsv(page.text, isTabSeparated(page) ? '\t' : ',').rows);
    }
    case 'html': {
      const rows = htmlRows(parseMarkup(page.text, 'html'), r.query, r.index);
      return rows && rows.length > 0 ? boundedRows(rows) : empty();
    }
    case 'xml':
      return xmlRows(page, r.xpath);
    case 'feed': {
      const feed = readFeed(page.text);
      if (!feed) return { error: '#N/A', why: 'The page is not an RSS or Atom feed' };
      const rows = feedRows(feed, r.query, r.headers, r.items);
      return rows.length > 0 ? boundedRows(rows) : empty();
    }
  }
}

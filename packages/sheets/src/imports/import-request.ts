// What an import asks of the web and what it gets back (docs/specs/029-sheets/imports.md): the engine makes the
// request from a formula's arguments, the page carries it to the api as a query string, and the api answers rows of
// text or a failure. One shape on every side, so the cache key, the wire and the checks agree.
import { ARRAY_CELLS_MAX, TEXT_RESULT_MAX } from '../limits';

export const IMPORT_KINDS = ['data', 'feed', 'html', 'xml'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** The formula functions that fetch, by the kind each asks for. */
export const IMPORT_FUNCTIONS: Readonly<Record<string, ImportKind>> = {
  IMPORTDATA: 'data',
  IMPORTFEED: 'feed',
  IMPORTHTML: 'html',
  IMPORTXML: 'xml',
};
export const IMPORT_FUNCTION_NAMES: ReadonlySet<string> = new Set(Object.keys(IMPORT_FUNCTIONS));

export const FEED_ITEM_FIELDS = ['title', 'author', 'url', 'created', 'summary'] as const;
export const FEED_FIELDS = ['title', 'description', 'author', 'url'] as const;
// What `items <type>` may name: Google's four (the items table also has the author).
const FEED_ITEM_TYPES = new Set(['title', 'summary', 'url', 'created']);
const FEED_TYPES = new Set<string>(FEED_FIELDS);

export type ImportRequest =
  | { kind: 'data'; url: string }
  | { kind: 'html'; url: string; query: 'table' | 'list'; index: number }
  | { kind: 'xml'; url: string; xpath: string }
  // `query`: `items`, `items <type>`, `feed` or `feed <type>`, lower case; `items`: how many, null for all.
  | { kind: 'feed'; url: string; query: string; headers: boolean; items: number | null };

// The errors an import's answer may be: Google's for a failed fetch, a blocked or refused one, a bad query.
export type ImportErrorCode = '#N/A' | '#REF!' | '#VALUE!';
export type ImportAnswer = { rows: string[][] } | { error: ImportErrorCode; why: string };

/** An import asked of the page: its request, its key, and whether it must skip the api's hour of keeping. */
export type ImportAsk = { key: string; request: ImportRequest; fresh: boolean };

// Each import's answer at most: the largest array a formula returns (D3), each text a value's longest.
export const IMPORT_VALUES_MAX = ARRAY_CELLS_MAX;
export const IMPORT_TEXT_MAX = TEXT_RESULT_MAX;

export const IMPORT_WORDS = {
  notFetched: (url: string) => `Could not fetch url: ${url}`,
  empty: 'Imported content is empty.',
  tooLarge: 'Result too large',
  blocked: 'Allow access to fetch data from the web',
  serverOff: 'This server does not fetch from the web',
  noFetcher: 'Imports are fetched while the spreadsheet is open',
  volatile:
    'This function is not allowed to reference a cell with NOW(), RAND(), RANDARRAY(), or RANDBETWEEN()',
  urlNotFound: (url: string) => `Url not found: ${url}`,
} as const;

/** An address to fetch as the formula gave it: http or https, a bare one read with http (D61); null for none. */
export function importUrl(text: string): string | null {
  const t = text.trim();
  if (t === '') return null;
  // `example.com:8080` is a host and its port, not a scheme.
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):(\d?)/.exec(t);
  const withScheme = !scheme || scheme[2] ? `http://${t}` : /^https?$/i.test(scheme[1]!) ? t : null;
  if (!withScheme) return null;
  try {
    return new URL(withScheme).href;
  } catch {
    return null;
  }
}

/** A feed query read as Google's: `items` or `feed`, with one of their types, lower case; null for none. */
export function feedQuery(text: string): string | null {
  const parts = text.trim().toLowerCase().split(/\s+/);
  const [what, type] = parts;
  if (parts.length > 2) return null;
  if (what === 'items')
    return type === undefined || FEED_ITEM_TYPES.has(type) ? parts.join(' ') : null;
  if (what === 'feed') return type === undefined || FEED_TYPES.has(type) ? parts.join(' ') : null;
  return null;
}

/** The key one import is known by: the same arguments, the same fetch and the same answer. */
export function importKey(r: ImportRequest): string {
  return JSON.stringify(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The request as the api's query string. */
export function importParams(r: ImportRequest, fresh = false): URLSearchParams {
  const p = new URLSearchParams({ kind: r.kind, url: r.url });
  if (r.kind === 'html') {
    p.set('query', r.query);
    p.set('index', String(r.index));
  } else if (r.kind === 'xml') p.set('xpath', r.xpath);
  else if (r.kind === 'feed') {
    p.set('query', r.query);
    p.set('headers', r.headers ? '1' : '0');
    if (r.items !== null) p.set('items', String(r.items));
  }
  if (fresh) p.set('fresh', '1');
  return p;
}

function positiveInt(text: string | null): number | null {
  if (text === null || !/^[1-9]\d{0,8}$/.test(text)) return null;
  return Number(text);
}

/** A request read back from the api's query string, every part checked; null when any is not one. */
export function readImportParams(p: URLSearchParams): ImportRequest | null {
  const kind = p.get('kind');
  const url = importUrl(p.get('url') ?? '');
  if (!url) return null;
  if (kind === 'data') return { kind, url };
  if (kind === 'xml') {
    const xpath = p.get('xpath');
    return xpath ? { kind, url, xpath } : null;
  }
  if (kind === 'html') {
    const query = p.get('query');
    const index = positiveInt(p.get('index'));
    return (query === 'table' || query === 'list') && index !== null
      ? { kind, url, query, index }
      : null;
  }
  if (kind === 'feed') {
    const query = feedQuery(p.get('query') ?? '');
    const headers = p.get('headers');
    const items = p.has('items') ? positiveInt(p.get('items')) : null;
    if (!query || (headers !== '0' && headers !== '1') || (p.has('items') && items === null))
      return null;
    return { kind, url, query, headers: headers === '1', items };
  }
  return null;
}

/** Rows made even and held to the import's bounds: a failure past IMPORT_VALUES_MAX, each text cut to its longest. */
export function boundedRows(rows: string[][]): ImportAnswer {
  if (rows.length > IMPORT_VALUES_MAX) return { error: '#N/A', why: IMPORT_WORDS.tooLarge };
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  if (width === 0) return { error: '#N/A', why: IMPORT_WORDS.empty };
  if (rows.length * width > IMPORT_VALUES_MAX) return { error: '#N/A', why: IMPORT_WORDS.tooLarge };
  return {
    rows: rows.map((r) => {
      const out = r.map((t) => (t.length > IMPORT_TEXT_MAX ? t.slice(0, IMPORT_TEXT_MAX) : t));
      while (out.length < width) out.push('');
      return out;
    }),
  };
}

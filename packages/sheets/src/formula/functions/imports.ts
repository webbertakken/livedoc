// The Web functions that fetch (docs/specs/029-sheets/imports.md): IMPORTDATA, IMPORTFEED, IMPORTHTML and IMPORTXML
// make a request from their arguments and read its answer through the frame, which the editor's engine fills from the
// api. Arguments reading NOW or RAND are refused before anything is asked, as Google refuses them. IMPORTRANGE
// (import-range.ts) is made the same way, its answer values rather than text.
import type { EvalValue, Frame } from '../../engine/frame';
import { parseLocaleNumber } from '../../input';
import {
  IMPORT_WORDS,
  feedQuery,
  importUrl,
  type ImportRequest,
} from '../../imports/import-request';
import { parseXPath } from '../../imports/xpath-parse';
import { boolArg, intArg, lazyFn, opt, textArg, valueArg, type FnDef, type Thunk } from '../fn';
import { PENDING, err, isError, type SheetError, type Value } from '../values';

// The request an import's arguments make, or the error they are.
export type Build = (args: EvalValue[], f: Frame) => ImportRequest | SheetError;

function urlOf(args: EvalValue[], f: Frame): string | SheetError {
  const text = textArg(args[0]!, f);
  if (isError(text)) return text;
  return importUrl(text) ?? err('#N/A', IMPORT_WORDS.urlNotFound(text));
}

/** One imported text as a value: empty, a number or a boolean as typed in `locale`, else the text (D63). */
export function importedValue(text: string, locale: string): Value {
  const t = text.trim();
  if (t === '') return null;
  const lower = t.toLowerCase();
  if (lower === 'true' || lower === 'false') return lower === 'true';
  return parseLocaleNumber(t, locale) ?? text;
}

export function importFn(min: number, max: number, build: Build, localeAt?: number): FnDef {
  return lazyFn(min, max, (thunks: Thunk[], f) => {
    // Read whole inside the watch, so a cell the arguments name is read (and its NOW seen) there.
    const [args, readsNow] = f.watchNow(() =>
      thunks.map((t): Value => {
        const v = t();
        return v === null ? null : valueArg(v, f);
      }),
    );
    if (readsNow) return err('#ERROR!', IMPORT_WORDS.volatile);
    let locale = f.locale;
    if (localeAt !== undefined && args[localeAt] !== undefined && args[localeAt] !== null) {
      const tag = textArg(args[localeAt], f);
      if (isError(tag)) return tag;
      const known = knownLocale(tag);
      if (!known) return err('#VALUE!', `"${tag}" is not a locale`);
      locale = known;
    }
    const request = build(args, f);
    if (isError(request)) return request;
    const read = f.importOf(request);
    if (read === null) return err('#N/A', IMPORT_WORDS.noFetcher);
    if (read === 'blocked' || read === 'offline') return err('#REF!', IMPORT_WORDS[read]);
    if (read === 'pending') return PENDING;
    if ('error' in read) return err(read.error, read.why);
    if ('values' in read) return { rows: read.values };
    return { rows: read.rows.map((row) => row.map((t) => importedValue(t, locale))) };
  });
}

function knownLocale(tag: string): string | null {
  try {
    return Intl.getCanonicalLocales(tag.replace(/_/g, '-'))[0]!;
  } catch {
    return null;
  }
}

export const IMPORT_FNS: Record<string, FnDef> = {
  IMPORTDATA: importFn(1, 1, (args, f) => {
    const url = urlOf(args, f);
    return isError(url) ? url : { kind: 'data', url };
  }),
  IMPORTHTML: importFn(3, 3, (args, f) => {
    const url = urlOf(args, f);
    if (isError(url)) return url;
    const query = textArg(args[1]!, f);
    if (isError(query)) return query;
    const q = query.trim().toLowerCase();
    if (q !== 'table' && q !== 'list') return err('#VALUE!', 'The query must be "table" or "list"');
    const index = intArg(args[2]!, f);
    if (isError(index)) return index;
    if (index < 1) return err('#VALUE!', 'The index starts at 1');
    return { kind: 'html', url, query: q, index };
  }),
  IMPORTXML: importFn(
    2,
    3,
    (args, f) => {
      const url = urlOf(args, f);
      if (isError(url)) return url;
      const xpath = textArg(args[1]!, f);
      if (isError(xpath)) return xpath;
      const parsed = parseXPath(xpath);
      if ('error' in parsed)
        return err('#VALUE!', `The XPath query cannot be read: ${parsed.error}`);
      return { kind: 'xml', url, xpath };
    },
    2,
  ),
  IMPORTFEED: importFn(1, 4, (args, f) => {
    const url = urlOf(args, f);
    if (isError(url)) return url;
    const text = opt(args, 1, f, textArg, 'items');
    if (isError(text)) return text;
    const query = feedQuery(text === '' ? 'items' : text);
    if (!query) return err('#VALUE!', `"${text}" is not a feed query`);
    const headers = opt(args, 2, f, boolArg, false);
    if (isError(headers)) return headers;
    const items = opt<number | null>(args, 3, f, intArg, null);
    if (isError(items)) return items;
    if (items !== null && items < 1) return err('#VALUE!', 'The number of items starts at 1');
    return { kind: 'feed', url, query, headers, items };
  }),
};

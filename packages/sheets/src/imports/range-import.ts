// IMPORTRANGE's own parts (docs/specs/029-sheets/formulas.md "Other workbooks"): which LiveDoc spreadsheet an address
// names, whether a range string can name cells at all, and Google's words for each way it fails. The engine checks
// both before asking; the api reads the source with the same checks, so the two sides agree on what a request is.
import { parseFormula } from '../formula/parse';
import type { Node } from '../formula/ast';

/** A document id at most (the api's own bound on an id). */
export const RANGE_SOURCE_ID_MAX = 200;
/** A range string at most: a sheet title (100) and a range, with room. */
export const RANGE_STRING_MAX = 300;

export const RANGE_WORDS = {
  // Verified: Google's help, "Permission & access".
  connect: 'You need to connect these sheets.',
  // Verified: Google's words (its forums); also a source that is not there, so an address never tells (D76).
  permission: "You don't have permissions to access that sheet.",
  // Verified: third-party guides quote Google's words.
  notFound: 'Cannot find range or sheet for imported range.',
  onlyLiveDoc: 'Only LiveDoc spreadsheets can be imported',
  // Verified: Google's words for an answer past its bound (third-party guides); `#ERROR!`.
  tooLarge: 'Result too large',
  circular: 'Circular dependency detected',
  // The source's room could not be reached: tried again on the next ask.
  unreadable: 'The spreadsheet could not be read. Try again later.',
} as const;

const ID_RE = /^[A-Za-z0-9_-]+$/;

function idOk(id: string): boolean {
  return id.length > 0 && id.length <= RANGE_SOURCE_ID_MAX && ID_RE.test(id);
}

/** The document id a spreadsheet address names: `https://<host>/document/<id>` (any path after it) or the id alone
 * (D75); null for anything else. */
export function rangeSource(text: string): string | null {
  const t = text.trim();
  if (idOk(t)) return t;
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const parts = url.pathname.split('/');
  if (parts[1] !== 'document') return null;
  const id = parts[2] ?? '';
  return idOk(id) ? id : null;
}

// A reference as typed: a cell or range (with or without its sheet), a span between two of them, or a name.
function namesCells(node: Node): boolean {
  if (node.k === 'ref' || node.k === 'name') return true;
  return node.k === 'range' && node.a.k === 'ref' && node.b.k === 'ref';
}

/** Whether `[sheet_name!]range` (or a named range) can name cells; what it names is the source's to say. */
export function rangeStringOk(text: string): boolean {
  const t = text.trim();
  if (t === '' || t.length > RANGE_STRING_MAX || t.startsWith('=')) return false;
  const parsed = parseFormula(`=${t}`);
  return parsed.ok && namesCells(parsed.ast);
}

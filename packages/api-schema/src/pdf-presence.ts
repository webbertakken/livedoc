// Where a person is in a PDF document, on the wire (docs/specs/035-pdf-documents/live-editing-and-storage.md
// "Presence"): the tab, the page in view by its name, their editing mode and at most one thing held. Presence: relayed
// unordered, never logged, never replayed. A peer's op is checked field by field before anyone draws it, and a name
// stays a short token until the surface finds it in its own file.

/** (default) The op as it was sent: three names and two numbers. */
export const PDF_PRESENCE_MAX_CHARS = 512;
/** (default) One name: an inserted page's is 66 characters at most, a mark's id 36. */
export const PDF_PRESENCE_NAME_MAX_CHARS = 80;

/** A PDF document's editing modes (editing-modes.md "Switching"), as a person's place names theirs. */
export const PDF_PRESENCE_MODES = ['viewing', 'reviewing', 'editing'] as const;
export type PdfPresenceMode = (typeof PDF_PRESENCE_MODES)[number];

/** What a person holds: a text selection by its page and characters, or a mark, an object or a text box typed in. */
export type PdfPresenceHeld =
  | { what: 'text'; page: string; first: number; last: number }
  | { what: 'mark' | 'object' | 'typing'; name: string };

export type PdfPresence =
  | { tabId: string; page: string; mode: PdfPresenceMode; held: PdfPresenceHeld | null }
  | { tabId: string; page: null };

const NAME = /^[A-Za-z0-9:_-]+$/;
const HELD_BY_NAME = ['mark', 'object', 'typing'] as const;

const name = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= PDF_PRESENCE_NAME_MAX_CHARS && NAME.test(v);

const character = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

function parseHeld(held: unknown): PdfPresenceHeld | null {
  if (typeof held !== 'object' || held === null) return null;
  const h = held as Record<string, unknown>;
  if (h.what === 'text') {
    if (!name(h.page) || !character(h.first) || !character(h.last) || h.last < h.first) return null;
    return { what: 'text', page: h.page, first: h.first, last: h.last };
  }
  const what = HELD_BY_NAME.find((kind) => kind === h.what);
  return what && name(h.name) ? { what, name: h.name } : null;
}

/** The place a `pdf-presence` op carries, or null when the op is malformed or passes PDF_PRESENCE_MAX_CHARS. */
export function parsePdfPresence(op: unknown): PdfPresence | null {
  if (typeof op !== 'object' || op === null) return null;
  const o = op as Record<string, unknown>;
  if (typeof o.tabId !== 'string' || o.tabId.length === 0) return null;
  if (JSON.stringify(op).length > PDF_PRESENCE_MAX_CHARS) return null;
  if (o.page === null) return { tabId: o.tabId, page: null };
  const mode = PDF_PRESENCE_MODES.find((known) => known === o.mode);
  if (!name(o.page) || !mode) return null;
  if (o.held === undefined || o.held === null)
    return { tabId: o.tabId, page: o.page, mode, held: null };
  const held = parseHeld(o.held);
  return held ? { tabId: o.tabId, page: o.page, mode, held } : null;
}

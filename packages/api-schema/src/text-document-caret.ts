// A writer's caret in a text document, on the wire (docs/specs/034-text-documents/live-editing-and-storage.md
// "Presence"): the selection's anchor and head as Yjs relative positions, base64, so a collaborator draws it by its
// character whatever is typed before it. Presence: relayed unordered, never logged, never replayed. A peer's op is
// checked field by field before anyone draws it.

/** (default) A relative position's base64 is a few dozen characters; anything longer is no caret. */
export const TEXT_DOCUMENT_CARET_MAX_CHARS = 256;
const MAX_TAB_ID = 256;

export type TextDocumentCaret =
  { tabId: string; anchor: string; head: string } | { tabId: string; anchor: null };

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const position = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= TEXT_DOCUMENT_CARET_MAX_CHARS && BASE64.test(v);

/** The caret a `text-document-caret` op carries, or null when the op is malformed. */
export function parseTextDocumentCaret(op: unknown): TextDocumentCaret | null {
  if (typeof op !== 'object' || op === null) return null;
  const o = op as Record<string, unknown>;
  if (typeof o.tabId !== 'string' || o.tabId.length === 0 || o.tabId.length > MAX_TAB_ID)
    return null;
  if (o.anchor === null) return { tabId: o.tabId, anchor: null };
  if (!position(o.anchor) || !position(o.head)) return null;
  return { tabId: o.tabId, anchor: o.anchor, head: o.head };
}

/** The header a text document's state answer carries its state vector in, base64
 *  (docs/specs/034-text-documents/live-editing-and-storage.md "Reconnecting"). */
export const TEXT_DOCUMENT_STATE_VECTOR_HEADER = 'X-State-Vector';

/** The header a Viewer's state answer names its Viewer copy in, and a Viewer's catch-up names the copy it holds
 *  (docs/specs/034-text-documents/live-editing-and-storage.md "A Viewer's copy"). */
export const TEXT_DOCUMENT_VIEWER_COPY_HEADER = 'X-Viewer-Copy';

/** The header a text document's file answer counts the pictures it left out in: media it could not read
 *  (docs/specs/034-text-documents/objects.md "Where the bytes live"). */
export const TEXT_DOCUMENT_PICTURES_LEFT_OUT_HEADER = 'X-Pictures-Left-Out';

/** The header a text document's file answer counts its conversion's losses in: 0 for the document's own format, else
 *  the count of everything a converted copy could not hold (docs/specs/034-text-documents/files-and-print.md "Downloading"). */
export const TEXT_DOCUMENT_CONVERSION_LOSSES_HEADER = 'X-Conversion-Losses';

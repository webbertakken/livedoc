// Where a link or a bookmark of a PDF leads (docs/specs/035-pdf-documents/security.md "Links and actions"): a place
// in the document, an address, or something LiveDoc never follows. A PDF is untrusted input: only `http`, `https`
// and `mailto` are ever opened, the address shown is the address opened, and every other action is listed, never run.
import { PDF_LINK_MAX_CHARS } from './limits';
import type { PageName } from './page-name';

/** What a file asks a reader to do that LiveDoc never does, as far as the engine names it. */
export type PdfActionKind = 'launch' | 'embedded-file' | 'other';

export type LinkTarget =
  /** A place in the document: the page by its name, and a point on it in page space where the file names one. */
  | {
      readonly kind: 'place';
      readonly page: PageName;
      readonly x: number | null;
      readonly y: number | null;
    }
  /** An address shown first, then opened in a new tab. */
  | { readonly kind: 'address'; readonly address: string }
  /** An address never opened, shown as text to copy. */
  | {
      readonly kind: 'refused';
      readonly reason: 'link_scheme_refused' | 'link_too_long';
      readonly address: string;
    }
  /** Another file by its path: never followed, the path shown as text. */
  | { readonly kind: 'file'; readonly path: string }
  /** Any other action: never performed, listed as "This file wanted to …". */
  | { readonly kind: 'action'; readonly action: PdfActionKind };

const OPENED_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:']);

// A scheme at the very start, as an address with one is written: letters, then letters, digits, `+`, `-` or `.`.
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export const LinkTarget = {
  /** The target an address is: one to open, or one refused with its reason. */
  ofAddress: (text: string): LinkTarget => {
    const address = text.trim();
    if (address.length > PDF_LINK_MAX_CHARS)
      return {
        kind: 'refused',
        reason: 'link_too_long',
        address: address.slice(0, PDF_LINK_MAX_CHARS),
      };
    const refused: LinkTarget = { kind: 'refused', reason: 'link_scheme_refused', address };
    // Read as written, before any parser's leniency: one that drops a tab or a line break would make a scheme of
    // "java\tscript:".
    if (!SCHEME.test(address)) return refused;
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      return refused;
    }
    if (!OPENED_SCHEMES.has(url.protocol)) return refused;
    // The address shown is the address opened: the parsed form, its name in plain (punycode) letters.
    return { kind: 'address', address: url.href };
  },
  /** Whether a press on the target ever leads anywhere. */
  follows: (target: LinkTarget): boolean => target.kind === 'place' || target.kind === 'address',
} as const;

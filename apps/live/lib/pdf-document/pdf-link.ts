// What a press on a bookmark or a link of a PDF does (docs/specs/035-pdf-documents/reading-surface.md "Following a
// link"; security.md "Links and actions"): a place in the document is gone to at once; an address is asked about
// first; everything else is said and never followed.
import type { LinkTarget, PageName } from '@livedoc/pdf-documents';

export type PdfLinkOutcome =
  | { readonly kind: 'go'; readonly index: number }
  | { readonly kind: 'nowhere' }
  | { readonly kind: 'ask'; readonly address: string }
  | { readonly kind: 'refused'; readonly address: string }
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'action' };

/** What a press on a link to `target` does in a file of `pages`; null names nowhere a reader can go. */
export function pdfLinkOutcome(
  target: LinkTarget | null,
  pages: readonly PageName[],
): PdfLinkOutcome {
  if (!target) return { kind: 'nowhere' };
  switch (target.kind) {
    case 'place': {
      const index = pages.indexOf(target.page);
      return index < 0 ? { kind: 'nowhere' } : { kind: 'go', index };
    }
    case 'address':
      return { kind: 'ask', address: target.address };
    case 'refused':
      return { kind: 'refused', address: target.address };
    case 'file':
      return { kind: 'file', path: target.path };
    case 'action':
      return { kind: 'action' };
  }
}

/** An address's scheme, the only part of it a log line names (`https`). */
export const schemeOf = (address: string): string => address.slice(0, address.indexOf(':'));

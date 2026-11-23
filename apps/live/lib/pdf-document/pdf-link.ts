// What a press on a bookmark or a link of a PDF does (docs/specs/035-pdf-documents/reading-surface.md "Following a
// link"; security.md "Links and actions"): a place in the document is gone to at once; an address is asked about
// first; everything else is said and never followed.
import {
  PageView,
  type LinkTarget,
  type PageInfo,
  type PageMatrix,
  type PageName,
} from '@livedoc/pdf-documents';

export type PdfLinkOutcome =
  /** A place: its page, and its point in page space where the file names one. */
  | {
      readonly kind: 'go';
      readonly index: number;
      readonly x: number | null;
      readonly y: number | null;
    }
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
      return index < 0 ? { kind: 'nowhere' } : { kind: 'go', index, x: target.x, y: target.y };
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

/** A link on a page as a person meets it: its control's name, and so its tooltip, saying where it leads as plain text. */
export function pdfLinkName(
  target: LinkTarget,
  pages: readonly Pick<PageInfo, 'name' | 'label'>[],
): string {
  switch (target.kind) {
    case 'place': {
      const at = pages.findIndex((page) => page.name === target.page);
      if (at < 0) return 'Link that goes nowhere';
      return `Link to page ${pages[at]!.label ?? String(at + 1)}`;
    }
    case 'address':
    case 'refused':
      return `Link to ${target.address}`;
    case 'file':
      return `Link to another file, ${target.path}`;
    case 'action':
      return 'Link to an action';
  }
}

const within = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * Where a place's point lies on its page as shown, as fractions of the page's width and height from its top left: the
 * point through the page's matrix, a coordinate the file leaves out taking the page's top left corner's, kept on the
 * page. `shown` is the page as drawn, its sides swapped for an odd turn.
 */
export function placeOnPage(
  matrix: PageMatrix,
  shown: { width: number; height: number },
  point: { x: number | null; y: number | null },
): { across: number; down: number } {
  const corner = PageView.toPage(matrix, { x: 0, y: 0 }) ?? { x: 0, y: 0 };
  const at = PageView.toView(matrix, { x: point.x ?? corner.x, y: point.y ?? corner.y });
  return { across: within(at.x / shown.width), down: within(at.y / shown.height) };
}

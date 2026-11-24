// The text of a surface's pages, read from the engine as a person selects or finds (docs/specs/035-pdf-documents/
// reading-surface.md "The pages": Selecting text; "Limits": PDF_PAGE_TEXTS_KEPT): a page's text read once and kept,
// the least lately used let go first, so a long file never holds every page's characters and boxes at once.
import {
  PDF_PAGE_TEXTS_KEPT,
  type PageTags,
  type PageText,
  type PdfEngine,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';

export type PdfPageTexts = {
  /** The page's text, or null where it has none or it cannot be read. */
  read(index: number): Promise<PageText | null>;
  /** The file's tags as they reach the page, read anew each time; null where they cannot be read. */
  tags(index: number): Promise<PageTags | null>;
};

export function pdfPageTexts(
  engine: Pick<PdfEngine, 'pageText' | 'pageTags'>,
  kept = PDF_PAGE_TEXTS_KEPT,
): PdfPageTexts {
  // In the order last used: the first is let go first.
  const held = new Map<number, Promise<PageText | null>>();
  return {
    read: (index) => {
      const known = held.get(index);
      if (known) {
        held.delete(index);
        held.set(index, known);
        return known;
      }
      const reading = engine.pageText(index).catch(() => {
        debugLog(`[pdf] page-text-failed page=${index + 1}`);
        held.delete(index);
        return null;
      });
      held.set(index, reading);
      if (held.size > kept) held.delete(held.keys().next().value!);
      return reading;
    },
    tags: (index) =>
      engine.pageTags(index).catch(() => {
        debugLog(`[pdf] page-tags-failed page=${index + 1}`);
        return null;
      }),
  };
}

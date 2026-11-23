// A thumbnail of the left panel (docs/specs/035-pdf-documents/reading-surface.md "Thumbnails"): its name, its
// caption, who is on its page, and its size, fitted into the thumbnail box upright as the file has the page.
import { PDF_THUMBNAIL_BOX_PX, type PageInfo } from '@livedoc/pdf-documents';

const PEOPLE = new Intl.ListFormat('en-GB', { type: 'conjunction' });

export const PdfThumbnailCopy = {
  /** "Page 3", or "Page 4, iv" where the page's label is not its number. */
  name: (index: number, label: string | null): string => {
    const number = String(index + 1);
    return label && label !== number ? `Page ${number}, ${label}` : `Page ${number}`;
  },
  /** The page's label where the file gives one, else its number. */
  caption: (index: number, label: string | null): string => label || String(index + 1),
  /** "Ada and Ben are here"; empty for nobody. */
  here: (names: readonly string[]): string =>
    names.length === 0 ? '' : `${PEOPLE.format(names)} ${names.length === 1 ? 'is' : 'are'} here`,
} as const;

/** The thumbnail's size in CSS pixels: the page fitted into the box, its longer side the box's. */
export function thumbnailSize(page: Pick<PageInfo, 'width' | 'height'>): {
  width: number;
  height: number;
} {
  const scale = PDF_THUMBNAIL_BOX_PX / Math.max(page.width, page.height);
  return { width: page.width * scale, height: page.height * scale };
}

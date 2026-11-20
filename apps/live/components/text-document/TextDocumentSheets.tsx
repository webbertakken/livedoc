// The pages' sheets behind the writing (docs/specs/034-text-documents/page-layout.md "Laying out", "Each page is drawn
// at its section's setup"): one sheet of the page's paper, colour and shadow per page, each at its section's size,
// centred one under another a gap apart, under the writing the layout spaces onto them. Unlaid out (pageless, a phone)
// one sheet fills the whole frame. Drawn only: never read, never focused.
import { PAGE_GAP_PX } from '@/lib/text-document/pagination/pagination';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-plugin';

export type TextDocumentSheetsProps = {
  /** Each page's size in CSS pixels, or null when the writing is not laid onto pages. */
  pages: readonly PageGeometry[] | null;
  /** A shadow under each sheet (none pageless, where the sheet is the ground). */
  shadow: boolean;
};

/** The frame the pages need: the widest page across, every page and gap down; null before there are pages. */
export function sheetsFrame(
  pages: readonly PageGeometry[] | null,
): { width: number; height: number } | null {
  if (!pages || pages.length === 0) return null;
  return {
    width: Math.max(...pages.map((p) => p.width)),
    height: pages.reduce((sum, p) => sum + p.height, 0) + (pages.length - 1) * PAGE_GAP_PX,
  };
}

export function TextDocumentSheets({ pages, shadow }: TextDocumentSheetsProps) {
  const className = `text-document-sheet absolute ${shadow ? 'shadow-sm' : ''}`;
  const frame = sheetsFrame(pages);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {!pages || !frame ? (
        <div className={`${className} inset-0`} />
      ) : (
        pages.map((page, index) => {
          const at = pages
            .slice(0, index)
            .reduce((sum, above) => sum + above.height + PAGE_GAP_PX, 0);
          return (
            <div
              key={index}
              data-page-sheet={index + 1}
              className={className}
              style={{
                top: at,
                left: (frame.width - page.width) / 2,
                width: page.width,
                height: page.height,
              }}
            />
          );
        })
      )}
    </div>
  );
}

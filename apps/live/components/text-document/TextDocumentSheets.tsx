// The pages' sheets behind the writing (docs/specs/034-text-documents/page-layout.md "Laying out"): one sheet of the
// page's paper, colour and shadow per page, a gap apart, under the writing the layout spaces onto them. Unlaid out
// (pageless, a phone) one sheet fills the whole frame. Drawn only: never read, never focused.
import { PAGE_GAP_PX } from '@/lib/text-document/pagination/pagination';

export type TextDocumentSheetsProps = {
  /** How many pages, or null when the writing is not laid onto pages. */
  pages: number | null;
  /** A shadow under each sheet (none pageless, where the sheet is the ground). */
  shadow: boolean;
};

export function TextDocumentSheets({ pages, shadow }: TextDocumentSheetsProps) {
  const className = `text-document-sheet absolute inset-x-0 ${shadow ? 'shadow-sm' : ''}`;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {pages === null ? (
        <div className={`${className} inset-y-0`} />
      ) : (
        Array.from({ length: pages }, (_, page) => (
          <div
            key={page}
            data-page-sheet={page + 1}
            className={`${className} h-(--page-height)`}
            style={{ top: `calc(${page} * (var(--page-height) + ${PAGE_GAP_PX}px))` }}
          />
        ))
      )}
    </div>
  );
}

/** The frame's height for `pages` pages a gap apart. */
export const sheetsHeight = (pages: number): string =>
  `calc(${pages} * (var(--page-height) + ${PAGE_GAP_PX}px) - ${PAGE_GAP_PX}px)`;

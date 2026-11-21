// The pages' sheets behind the writing (docs/specs/034-text-documents/page-layout.md "Laying out", "Each page is drawn
// at its section's setup"): one sheet of the page's paper, colour and shadow per page, each at its section's size,
// centred one under another a gap apart, under the writing the layout spaces onto them. Unlaid out (pageless, a phone)
// one sheet fills the whole frame. A section's line between columns (page-layout.md "Columns") is drawn on its sheet,
// a thin line in the writing's ink. Each page's header and footer (page-layout.md "Headers and footers") is drawn in
// its margins, an empty one not at all; their sources lie hidden behind the first sheet. Drawn only: never read, never
// focused.
import { PAGE_GAP_PX } from '@/lib/text-document/pagination/pagination';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import type { PageStory } from '@/lib/text-document/pagination/pagination-headers';
import { STORY_KEY_ATTRIBUTE } from './useTextDocumentStories';

export type TextDocumentSheetsProps = {
  /** Each page's size in CSS pixels, or null when the writing is not laid onto pages. */
  pages: readonly PageGeometry[] | null;
  /** A shadow under each sheet (none pageless, where the sheet is the ground). */
  shadow: boolean;
  /** The hidden place the headers' and footers' sources lie in, beside the pages' boxes they paint. */
  storyHost?: (element: HTMLDivElement | null) => void;
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

export function TextDocumentSheets({ pages, shadow, storyHost }: TextDocumentSheetsProps) {
  const className = `text-document-sheet absolute ${shadow ? 'shadow-sm' : ''}`;
  const frame = sheetsFrame(pages);
  // A header from its margin down, a footer up from its margin, at the section's left margin and text width; its
  // writing painted in by its source (useTextDocumentStories).
  const story = (kind: 'header' | 'footer', place: PageStory | undefined) =>
    place ? (
      <div
        data-page-story={kind}
        data-story={place.story}
        {...{ [STORY_KEY_ATTRIBUTE]: place.key }}
        className="absolute"
        style={{
          left: place.left,
          width: place.width,
          ...(kind === 'header' ? { top: place.margin } : { bottom: place.margin }),
        }}
      />
    ) : null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {storyHost ? (
        <div ref={storyHost} data-story-sources="" className="invisible absolute top-0 left-0" />
      ) : null}
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
            >
              {(page.rules ?? []).flatMap((rule, r) =>
                rule.xs.map((x) => (
                  <div
                    key={`${r}:${x}`}
                    data-column-line=""
                    className="absolute w-px bg-current"
                    style={{ left: x, top: rule.top, height: rule.bottom - rule.top }}
                  />
                )),
              )}
              {story('header', page.header)}
              {story('footer', page.footer)}
            </div>
          );
        })
      )}
    </div>
  );
}

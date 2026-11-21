// Footnotes on the pages (docs/specs/034-text-documents/page-layout.md "Footnotes", "Drawn"): each page draws the notes
// whose marks' lines are on it, numbered 1, 2, 3 through the document, at its section's left margin and text width.
// Pure: the marks' lines come measured.
import type { Pagination } from './pagination';
import { storyKey } from './pagination-headers';

/** A note's mark on a block's line, naming the note's story. */
export type NoteMark = { readonly line: number; readonly story: string };

/** A note drawn at a page's foot: its story at its width, its number, where it stands across the page (px). */
export type PageNote = {
  readonly story: string;
  readonly key: string;
  readonly number: number;
  readonly left: number;
  readonly width: number;
};

/** Each page's notes, by its start, in the order of their marks. */
export function pageNotes(
  pagination: Pagination,
  marks: readonly (readonly NoteMark[] | undefined)[],
  placeOf: (block: number) => { readonly left: number; readonly width: number },
): PageNote[][] {
  const { starts } = pagination;
  const pages: PageNote[][] = starts.map(() => []);
  const before = (b: number, line: number, q: number) => {
    const start = starts[q]!;
    return b < start.block || (b === start.block && line < start.line);
  };
  let number = 0;
  let q = 0;
  marks.forEach((own, block) => {
    for (const mark of own ?? []) {
      number += 1;
      while (q + 1 < starts.length && !before(block, mark.line, q + 1)) q += 1;
      const { left, width } = placeOf(block);
      pages[q]!.push({ story: mark.story, key: storyKey(mark.story, width), number, left, width });
    }
  });
  return pages;
}

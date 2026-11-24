// A table of contents (docs/specs/034-text-documents/links-and-navigation.md "Table of contents", standard-mapping.md
// "Tables of contents"): one block of the body, its look, the heading levels it lists (1 up to a level), and its
// entries, paragraphs as the body's, each linking to its heading.
import type { Paragraph } from './blocks';

/** Plain text (page numbers at the margin), Dotted (dots leading to them) or With blue links (no page numbers). */
export type ContentsLook = 'plain' | 'dotted' | 'links';

export type TableOfContents = {
  readonly type: 'contents';
  readonly look: ContentsLook;
  /** It lists headings of levels 1 up to this, 1 to CONTENTS_LEVELS_MAX. */
  readonly levels: number;
  readonly entries: readonly Paragraph[];
};

/** The deepest heading level a table of contents lists. */
export const CONTENTS_LEVELS_MAX = 6;

export const Contents = {
  /** A file's levels as the model holds them: 1 to CONTENTS_LEVELS_MAX, all of them when unsaid or unreadable. */
  levelsOf: (n: number | undefined): number =>
    n === undefined || !Number.isFinite(n) || n < 1
      ? CONTENTS_LEVELS_MAX
      : Math.min(CONTENTS_LEVELS_MAX, Math.floor(n)),

  /** The look a file's table of contents reads as: no page numbers is With blue links; a dot leading to them Dotted. */
  lookOf: ({ pages, dotted }: { pages: boolean; dotted: boolean }): ContentsLook =>
    !pages ? 'links' : dotted ? 'dotted' : 'plain',
} as const;

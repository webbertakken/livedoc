// A table of contents (docs/specs/034-text-documents/links-and-navigation.md "Table of contents", standard-mapping.md
// "Tables of contents"): one block of the body, its look, the heading levels it lists (1 up to a level), and its
// entries, paragraphs as the body's, each linking to its heading.
import type { Paragraph } from './blocks';
import type { BlockSuggested } from './suggestions';
import { Styles, type Style } from './styles';

/** Plain text (page numbers at the margin), Dotted (dots leading to them) or With blue links (no page numbers). */
export type ContentsLook = 'plain' | 'dotted' | 'links';

export type TableOfContents = {
  readonly type: 'contents';
  readonly look: ContentsLook;
  /** It lists headings of levels 1 up to this, 1 to CONTENTS_LEVELS_MAX. */
  readonly levels: number;
  readonly entries: readonly Paragraph[];
  /** Its insertion or deletion, whole (review.md "How a suggestion is kept"). */
  readonly suggested?: BlockSuggested;
};

/** The deepest heading level a table of contents lists. */
export const CONTENTS_LEVELS_MAX = 6;

/** How far each entry style is indented past the one above it: 0.5 cm, in points (default). */
export const CONTENTS_INDENT_PT = 14.17;

const ENTRY_STYLE_IDS = {
  odf: (level: number) => `Contents_20_${level}`,
  ooxml: (level: number) => `TOC${level}`,
} as const;

// Its name in each format: LibreOffice's, and Word's own built-in name, so Word knows it as its table of contents'.
const ENTRY_STYLE_NAMES = {
  odf: (level: number) => `Contents ${level}`,
  ooxml: (level: number) => `toc ${level}`,
} as const;

export const Contents = {
  /** A file's levels as the model holds them: 1 to CONTENTS_LEVELS_MAX, all of them when unsaid or unreadable. */
  levelsOf: (n: number | undefined): number =>
    n === undefined || !Number.isFinite(n) || n < 1
      ? CONTENTS_LEVELS_MAX
      : Math.min(CONTENTS_LEVELS_MAX, Math.floor(n)),

  /** The look a file's table of contents reads as: no page numbers is With blue links; a dot leading to them Dotted. */
  lookOf: ({ pages, dotted }: { pages: boolean; dotted: boolean }): ContentsLook =>
    !pages ? 'links' : dotted ? 'dotted' : 'plain',

  /** A file's own style for entries of `level`, in either format's spelling, by its id or its name. */
  heldStyle: (styles: readonly Style[], level: number): Style | undefined => {
    const ids = [ENTRY_STYLE_IDS.odf(level), ENTRY_STYLE_IDS.ooxml(level)];
    const names = [ENTRY_STYLE_NAMES.odf(level), ENTRY_STYLE_NAMES.ooxml(level)];
    return styles.find(
      (s) =>
        s.family === 'paragraph' &&
        (ids.includes(s.id) || names.map((n) => n.toLowerCase()).includes(s.name.toLowerCase())),
    );
  },

  /** LiveDoc's own style for entries of `level`, its id free among `styles`: Normal text, indented a level in. */
  entryStyle: (format: 'odf' | 'ooxml', level: number, styles: readonly Style[]): Style => {
    const wanted = ENTRY_STYLE_IDS[format](level);
    const taken = new Set(styles.map((s) => s.id));
    let id = wanted;
    for (let n = 2; taken.has(id); n++) id = `${wanted}${n}`;
    const normal = Styles.idOfRole(styles, 'normal');
    return {
      id,
      name: ENTRY_STYLE_NAMES[format](level),
      family: 'paragraph',
      ...(normal ? { parent: normal } : {}),
      paragraph: { indentStart: (level - 1) * CONTENTS_INDENT_PT },
      text: {},
    };
  },
} as const;

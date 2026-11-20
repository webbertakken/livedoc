// What laying the writing onto pages reads and gives (docs/specs/034-text-documents/page-layout.md "Laying out",
// "Columns"): the blocks' measured lines, each section's page frame, and where each page and column starts, the
// spacers that take the drawn writing there and the paragraphs drawn across columns. The arithmetic is
// pagination-engine.ts; the plugin measures the blocks and draws what it gives.
import { Columns, type PageSetup, type SectionStart } from '@livedoc/text-documents';

/** The ground between two pages at 100% zoom, in CSS pixels (default). */
export const PAGE_GAP_PX = 12;
/** The ground above the first page and below the last, in CSS pixels (default). */
export const PAGES_EDGE_PX = 24;
// Points to CSS pixels.
const PX_PER_PT = 96 / 72;

/** A line's box, from the top of its block's border box, in CSS pixels. */
export type LineBox = { readonly top: number; readonly bottom: number };

/** A block as the layout reads it, in CSS pixels, without any spacer the layout put inside it. */
export type BlockMetrics = {
  /** Its border box. */
  readonly height: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  /** Its lines; none for a block that moves whole. */
  readonly lines: readonly LineBox[];
  /** It moves whole: a section break's line, content kept from a file. */
  readonly atom?: boolean;
  readonly keepWithNext?: boolean;
  readonly keepTogether?: boolean;
  /** Prevent single lines: widows and orphans of two. */
  readonly widowControl?: boolean;
  /** A page break before. */
  readonly breakBefore?: boolean;
  /** A page break after it: the next block starts a new page. */
  readonly breakAfter?: boolean;
  /** Lines that start a new page whatever the rules (a page break inside the paragraph before them). */
  readonly forced?: readonly number[];
  /** A section break: where the section it starts begins. */
  readonly startsSection?: SectionStart;
};

/** A page's geometry in CSS pixels: its height, its margins and the text area between them, and its section's columns. */
export type PageFrame = {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly bottom: number;
  /** The left margin. */
  readonly left: number;
  readonly textHeight: number;
  /** Two or more columns; absent is one. */
  readonly columns?: { readonly count: number; readonly width: number; readonly gap: number };
};

/**
 * Where a page starts: before block `block` (`line` 0) or before its line `line`; `gap` is the spacer's height that
 * takes the writing there, and `blank` the blank pages before it.
 */
export type PageStart = {
  readonly block: number;
  readonly line: number;
  readonly gap: number;
  readonly blank: number;
  /** A box of columns carries the writing onto this page (its row gap is the spacer). */
  readonly carried?: true;
  /** Where the page's columns after a region's first start. */
  readonly columns?: readonly ColumnStart[];
  /** Spacers between blocks on the page, besides its own gap. */
  readonly spacers?: readonly Spacer[];
  /** Paragraphs that start on the page and cross columns. */
  readonly crosses?: readonly Cross[];
  /** Each region of columns on the page, for its lines between. */
  readonly rules?: readonly RegionRule[];
};

/** Column `column` (1 or more) of its region starts before block `block`, or before its line `line`. */
export type ColumnStart = {
  readonly block: number;
  readonly line: number;
  readonly column: number;
};

/** A spacer before block `block` taking the drawn strip by `height` (negative: back up). */
export type Spacer = { readonly block: number; readonly height: number };

/**
 * A paragraph whose lines cross columns, drawn as a box of `count` columns over its region from the region's top
 * (`top`, on the page it starts on): it starts in column `column`, `lead` below the top; each of `splits` starts
 * the next column; its columns are `height` high, in `rows` pages `rowGap` apart.
 */
export type Cross = {
  readonly block: number;
  readonly top: number;
  readonly count: number;
  readonly column: number;
  readonly lead: number;
  readonly splits: readonly number[];
  readonly height: number;
  readonly rows: number;
  readonly rowGap: number;
};

/** A region of columns on a page, from `top` to the foot of its longest column, in the section of block `block`. */
export type RegionRule = {
  readonly block: number;
  readonly top: number;
  readonly bottom: number;
  readonly count: number;
};

export type Pagination = {
  readonly starts: readonly PageStart[];
  /** The page the layout started from. */
  readonly laidFrom: number;
  /** The page where it found the previous layout again, or null when it laid out to the end. */
  readonly settledAt: number | null;
};

/** What changed since a previous layout: blocks `first` to `last` (new indices) are new, and `delta` were added. */
export type LayoutChange = {
  readonly previous: Pagination;
  readonly first: number;
  readonly last: number;
  readonly delta: number;
};

/** A page setup's frame. */
export function pageFrame(setup: PageSetup): PageFrame {
  const { top, bottom } = setup.margins;
  const columns = Columns.of(setup);
  return {
    width: setup.width * PX_PER_PT,
    height: setup.height * PX_PER_PT,
    top: top * PX_PER_PT,
    bottom: bottom * PX_PER_PT,
    left: setup.margins.left * PX_PER_PT,
    textHeight: (setup.height - top - bottom) * PX_PER_PT,
    ...(columns.count > 1
      ? {
          columns: {
            count: columns.count,
            width: Columns.width(setup) * PX_PER_PT,
            gap: columns.gap * PX_PER_PT,
          },
        }
      : {}),
  };
}

/** How many pages a layout has, blank ones included. */
export const pageCount = (pagination: Pagination): number =>
  pagination.starts.reduce((count, start) => count + 1 + start.blank, 0);

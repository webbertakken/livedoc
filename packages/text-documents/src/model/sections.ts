// Sections and page setup (docs/specs/034-text-documents/page-layout.md): each section has its paper, orientation,
// margins, page colour and columns, and starts on a new page or continues the page.
import { HEADER_FOOTER_MARGIN_PT, type SectionHeaders } from './headers';
import type { KeptProperties } from './props';

export type Margins = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  /** The header's distance from the top edge (page-layout.md "Headers and footers"); absent is 0.5 in. */
  readonly header?: number;
  /** The footer's distance from the bottom edge; absent is 0.5 in. */
  readonly footer?: number;
};

/** Lengths in points. */
export type PageSetup = {
  readonly width: number;
  readonly height: number;
  readonly orientation: 'portrait' | 'landscape';
  readonly margins: Margins;
  /** `#rrggbb`; absent is white. */
  readonly pageColor?: string;
  readonly columns?: Columns;
};

/** A section's columns (page-layout.md "Columns"): how many, the gap between two in points, a line in each gap. */
export type Columns = {
  readonly count: number;
  readonly gap: number;
  readonly separator?: true;
};

export type Orientation = PageSetup['orientation'];

export type SectionStart = 'next-page' | 'continuous' | 'even-page' | 'odd-page';

export type Section = {
  readonly start: SectionStart;
  readonly setup: PageSetup;
  readonly headers?: SectionHeaders;
  /** The number its first page has (page-layout.md "Page numbers"); absent, it counts on from the pages before. */
  readonly numberStart?: number;
  readonly kept?: KeptProperties;
};

const IN = 72;
const MM = 72 / 25.4;
const mm = (width: number, height: number) => ({
  width: Math.round(width * MM * 1000) / 1000,
  height: Math.round(height * MM * 1000) / 1000,
});

/** Google Docs' paper sizes, portrait, in points (page-layout.md "Page setup"). */
export const PAPER = {
  letter: { width: 8.5 * IN, height: 11 * IN },
  tabloid: { width: 11 * IN, height: 17 * IN },
  legal: { width: 8.5 * IN, height: 14 * IN },
  statement: { width: 5.5 * IN, height: 8.5 * IN },
  executive: { width: 7.25 * IN, height: 10.5 * IN },
  folio: { width: 8.5 * IN, height: 13 * IN },
  a3: mm(297, 420),
  a4: mm(210, 297),
  a5: mm(148, 210),
  b4: mm(250, 353),
  b5: mm(176, 250),
} as const;

export type PaperName = keyof typeof PAPER;

/** The order Google's Paper size list has them in. */
export const PAPER_ORDER = Object.keys(PAPER) as readonly PaperName[];

/** A side within this of a paper's is that paper: a file's units round (OOXML holds twentieths of a point). */
export const PAPER_TOLERANCE_PT = 0.5;

/** The largest page side either format's suites offer: 22 in. */
export const PAGE_SIDE_MAX_PT = 22 * IN;

/** The text keeps at least this width and height inside the margins: 1 in (default). */
export const MIN_TEXT_SIDE_PT = IN;

const HEX = /^#[0-9a-f]{6}$/i;

const near = (a: number, b: number) => Math.abs(a - b) <= PAPER_TOLERANCE_PT;

const isLength = (value: unknown, max = PAGE_SIDE_MAX_PT): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const PageSetup = {
  /**
   * A new text document's page: Letter or A4, portrait, 1 in margins, white (page-layout.md), in the format's own
   * resolution (OOXML holds twentieths of a point), so it reads back as it was written.
   */
  of: (paper: PaperName, format: 'odf' | 'ooxml' = 'odf'): PageSetup => ({
    width: format === 'ooxml' ? Math.round(PAPER[paper].width * 20) / 20 : PAPER[paper].width,
    height: format === 'ooxml' ? Math.round(PAPER[paper].height * 20) / 20 : PAPER[paper].height,
    orientation: 'portrait',
    margins: { top: IN, bottom: IN, left: IN, right: IN },
  }),
  /** The paper the page has, either way round; null for a size a file brought that is none of Google's. */
  paperOf: (setup: PageSetup): PaperName | null => {
    const short = Math.min(setup.width, setup.height);
    const long = Math.max(setup.width, setup.height);
    return (
      PAPER_ORDER.find(
        (name) => near(PAPER[name].width, short) && near(PAPER[name].height, long),
      ) ?? null
    );
  },
  /** The setup turned to `orientation`: landscape lays the longer side across; the margins stay as they are. */
  oriented: (setup: PageSetup, orientation: Orientation): PageSetup => {
    const short = Math.min(setup.width, setup.height);
    const long = Math.max(setup.width, setup.height);
    return orientation === 'landscape'
      ? { ...setup, width: long, height: short, orientation }
      : { ...setup, width: short, height: long, orientation };
  },
  /** The setup on another paper, in its orientation. */
  withPaper: (setup: PageSetup, paper: PaperName): PageSetup =>
    PageSetup.oriented(
      { ...setup, width: PAPER[paper].width, height: PAPER[paper].height },
      setup.orientation,
    ),
  /** Room left for the text inside the margins, across and down. */
  room: (setup: PageSetup): { across: number; down: number } => ({
    across: setup.width - setup.margins.left - setup.margins.right,
    down: setup.height - setup.margins.top - setup.margins.bottom,
  }),
  /** The same page: sides, orientation, margins (the header's and footer's too) and colour (columns are the section's own matter). */
  equal: (a: PageSetup, b: PageSetup): boolean =>
    a.width === b.width &&
    a.height === b.height &&
    a.orientation === b.orientation &&
    a.margins.top === b.margins.top &&
    a.margins.bottom === b.margins.bottom &&
    a.margins.left === b.margins.left &&
    a.margins.right === b.margins.right &&
    (a.margins.header ?? HEADER_FOOTER_MARGIN_PT) ===
      (b.margins.header ?? HEADER_FOOTER_MARGIN_PT) &&
    (a.margins.footer ?? HEADER_FOOTER_MARGIN_PT) ===
      (b.margins.footer ?? HEADER_FOOTER_MARGIN_PT) &&
    (a.pageColor ?? null) === (b.pageColor ?? null),
  /** A kept setup read back checked (a person's default): its sides, orientation, margins and colour, else null. */
  parse: (raw: unknown): PageSetup | null => {
    const value = record(raw);
    const margins = record(value?.margins);
    if (!value || !margins) return null;
    const { width, height, orientation, pageColor } = value;
    const { top, bottom, left, right } = margins;
    if (!isLength(width) || !isLength(height) || width === 0 || height === 0) return null;
    if (orientation !== 'portrait' && orientation !== 'landscape') return null;
    if (!isLength(top) || !isLength(bottom) || !isLength(left) || !isLength(right)) return null;
    if (pageColor !== undefined && (typeof pageColor !== 'string' || !HEX.test(pageColor)))
      return null;
    const setup: PageSetup = {
      width,
      height,
      orientation,
      margins: { top, bottom, left, right },
      ...(pageColor === undefined ? {} : { pageColor }),
    };
    const room = PageSetup.room(setup);
    return room.across >= MIN_TEXT_SIDE_PT && room.down >= MIN_TEXT_SIDE_PT ? setup : null;
  },
} as const;

/** The gap a section with none yet gets: 0.5 in (assumed: Google's). */
export const COLUMN_GAP_PT = IN / 2;
/** Every column keeps at least this width: 0.5 in (default). */
export const MIN_COLUMN_WIDTH_PT = IN / 2;
/** Google offers one to three columns. */
export const MAX_COLUMNS = 3;

const ONE_COLUMN: Columns = { count: 1, gap: COLUMN_GAP_PT };

export const Columns = {
  /** A section's columns: one, with the default gap, when it has none. */
  of: (setup: Pick<PageSetup, 'columns'>): Columns =>
    setup.columns && setup.columns.count > 1 ? setup.columns : ONE_COLUMN,
  /** The text area's width across all columns, in points. */
  textWidth: (setup: PageSetup): number => PageSetup.room(setup).across,
  /** One column's width, in points. */
  width: (setup: PageSetup): number => {
    const { count, gap } = Columns.of(setup);
    return (Columns.textWidth(setup) - gap * (count - 1)) / count;
  },
  /** The widest gap that leaves `count` columns each at least the narrowest, in points; 0 when none would. */
  mostGap: (setup: PageSetup, count: number): number =>
    count < 2
      ? 0
      : Math.max(0, (Columns.textWidth(setup) - MIN_COLUMN_WIDTH_PT * count) / (count - 1)),
  /** The same columns: count, gap and line (a gap or line on one column counts for nothing). */
  equal: (a: Columns, b: Columns): boolean =>
    a.count === b.count &&
    (a.count < 2 || (a.gap === b.gap && (a.separator ?? false) === (b.separator ?? false))),
  /** A setup with these columns; one column is none. */
  onto: (setup: PageSetup, columns: Columns): PageSetup => {
    const { columns: _was, ...rest } = setup;
    return columns.count > 1 ? { ...rest, columns } : rest;
  },
} as const;

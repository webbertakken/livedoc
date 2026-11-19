// Sections and page setup (docs/specs/034-text-documents/page-layout.md): each section has its paper, orientation,
// margins, page colour and columns, and starts on a new page or continues the page.
import type { KeptProperties } from './props';

export type Margins = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
};

/** Lengths in points. */
export type PageSetup = {
  readonly width: number;
  readonly height: number;
  readonly orientation: 'portrait' | 'landscape';
  readonly margins: Margins;
  /** `#rrggbb`; absent is white. */
  readonly pageColor?: string;
  readonly columns?: { readonly count: number; readonly gap: number };
};

export type SectionStart = 'next-page' | 'continuous' | 'even-page' | 'odd-page';

export type Section = {
  readonly start: SectionStart;
  readonly setup: PageSetup;
  readonly kept?: KeptProperties;
};

export const PAPER = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.276, height: 841.89 },
} as const;

export const PageSetup = {
  /**
   * A new text document's page: Letter or A4, portrait, 1 in margins, white (page-layout.md), in the format's own
   * resolution (OOXML holds twentieths of a point), so it reads back as it was written.
   */
  of: (paper: keyof typeof PAPER, format: 'odf' | 'ooxml' = 'odf'): PageSetup => ({
    width: format === 'ooxml' ? Math.round(PAPER[paper].width * 20) / 20 : PAPER[paper].width,
    height: format === 'ooxml' ? Math.round(PAPER[paper].height * 20) / 20 : PAPER[paper].height,
    orientation: 'portrait',
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
  }),
} as const;

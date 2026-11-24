// A person's view of a PDF document (docs/specs/035-pdf-documents/reading-surface.md "The pages": Page display, Zoom,
// The view is the person's): how the pages are laid side by side and how large they are drawn. A value, kept while
// the surface is open and never stored; where the pages then lie is pdf-page-layout.ts.
import { PDF_ZOOM_MAX, PDF_ZOOM_MIN, PDF_ZOOM_STEPS, type PageTurns } from '@livedoc/pdf-documents';

/** Fit width, Fit page, or a scale: 1 is 100%, Actual size. */
export type PdfZoom = 'fit-width' | 'fit-page' | number;

export type PdfPageDisplay = {
  /** Pages side by side in a row. */
  readonly across: 1 | 2;
  /** Every row down the view; else the row in view alone. */
  readonly continuous: boolean;
  /** The first page alone, as a book's cover, where two are across. */
  readonly cover: boolean;
};

/** View > Page display's four: Single page, Continuous, Two pages, Two pages, continuous. */
export type PdfPageDisplayName = 'single' | 'continuous' | 'two' | 'two-continuous';

/** Rotate view's turn, in quarters clockwise, as the engine draws it. */
export type PdfView = {
  readonly zoom: PdfZoom;
  readonly display: PdfPageDisplay;
  readonly turns: PageTurns;
};

// A scale this near a step is that step: a fitted zoom is a quotient, never exactly a step.
const STEP_SLACK = 1e-6;

const clamp = (scale: number): number => Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, scale));

export const PdfView = {
  initial: (): PdfView => ({
    zoom: 'fit-width',
    display: { across: 1, continuous: true, cover: false },
    turns: 0,
  }),

  /** A quarter turn more, clockwise (1) or counterclockwise (-1). */
  turned: (view: PdfView, by: 1 | -1): PdfView => ({
    ...view,
    turns: ((view.turns + by + 4) % 4) as PageTurns,
  }),

  /** A page's size as drawn turned: on its side for an odd turn. */
  sizeTurned: <Size extends { width: number; height: number }>(
    page: Size,
    turns: PageTurns,
  ): Size => (turns % 2 === 1 ? { ...page, width: page.height, height: page.width } : page),

  displayName: ({ across, continuous }: PdfPageDisplay): PdfPageDisplayName => {
    if (across === 1) return continuous ? 'continuous' : 'single';
    return continuous ? 'two-continuous' : 'two';
  },

  withDisplay: (view: PdfView, name: PdfPageDisplayName): PdfView => ({
    ...view,
    display: {
      across: name === 'two' || name === 'two-continuous' ? 2 : 1,
      continuous: name === 'continuous' || name === 'two-continuous',
      cover: view.display.cover,
    },
  }),

  withCover: (view: PdfView, cover: boolean): PdfView => ({
    ...view,
    display: { ...view.display, cover },
  }),

  withZoom: (view: PdfView, zoom: PdfZoom): PdfView => ({
    ...view,
    zoom: typeof zoom === 'number' ? clamp(zoom) : zoom,
  }),

  /** Full screen's view (reading-surface.md "Full screen"): one page a screen, at Fit page, Rotate view kept. */
  presented: (view: PdfView): PdfView =>
    PdfView.withZoom(PdfView.withDisplay(view, 'single'), 'fit-page'),

  /** The step above the scale shown; the most where there is none. */
  stepIn: (scale: number): number =>
    PDF_ZOOM_STEPS.find((step) => step > scale + STEP_SLACK) ?? PDF_ZOOM_MAX,

  /** The step below the scale shown; the least where there is none. */
  stepOut: (scale: number): number =>
    PDF_ZOOM_STEPS.findLast((step) => step < scale - STEP_SLACK) ?? PDF_ZOOM_MIN,

  /** "117%"; one decimal only under 100%, where the scale has one ("12.5%"). */
  percent: (scale: number): string => {
    const tenths = Math.round(scale * 1000) / 10;
    return `${tenths < 100 && !Number.isInteger(tenths) ? tenths : Math.round(tenths)}%`;
  },

  /** A typed zoom as a scale: 10 to 6400, with or without a "%"; null when it is none. */
  parseZoom: (text: string): number | null => {
    const match = /^\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*%?\s*$/.exec(text);
    if (!match) return null;
    const scale = Number(match[1]!.replace(',', '.')) / 100;
    return scale >= PDF_ZOOM_MIN && scale <= PDF_ZOOM_MAX ? scale : null;
  },

  /**
   * A typed page as the page's index, given each page's label (null where the file gives none): a number from 1 to
   * the page count is that page, any other value the page it labels, as written first, then in any case
   * (reading-surface.md "Go to page"). Null when it names no page.
   */
  parsePage: (text: string, labels: readonly (string | null)[]): number | null => {
    const typed = text.trim();
    if (typed === '') return null;
    if (/^\d{1,7}$/.test(typed)) {
      const number = Number(typed);
      if (number >= 1 && number <= labels.length) return number - 1;
    }
    const exact = labels.indexOf(typed);
    if (exact >= 0) return exact;
    const lower = typed.toLocaleLowerCase();
    const anyCase = labels.findIndex((label) => label?.toLocaleLowerCase() === lower);
    return anyCase >= 0 ? anyCase : null;
  },
} as const;

// A person's view of a PDF document (docs/specs/035-pdf-documents/reading-surface.md "The pages": Page display, Zoom,
// The view is the person's): how the pages are laid side by side and how large they are drawn. A value, kept while
// the surface is open and never stored; where the pages then lie is pdf-page-layout.ts.
import { PDF_ZOOM_MAX, PDF_ZOOM_MIN, PDF_ZOOM_STEPS } from '@livedoc/pdf-documents';

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

export type PdfView = { readonly zoom: PdfZoom; readonly display: PdfPageDisplay };

// A scale this near a step is that step: a fitted zoom is a quotient, never exactly a step.
const STEP_SLACK = 1e-6;

const clamp = (scale: number): number => Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, scale));

export const PdfView = {
  initial: (): PdfView => ({
    zoom: 'fit-width',
    display: { across: 1, continuous: true, cover: false },
  }),

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

  /** A typed page number as the page's index in a file of `count` pages; null when it is no page of it. */
  parsePage: (text: string, count: number): number | null => {
    if (!/^\s*\d{1,7}\s*$/.test(text)) return null;
    const number = Number(text);
    return number >= 1 && number <= count ? number - 1 : null;
  },
} as const;

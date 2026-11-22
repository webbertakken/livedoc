// An office kind's zoom (docs/specs/034-text-documents/editing-surface.md "Zoom"): a percentage from 50 to 200, or
// Fit, which fits the page width to the window; what the toolbar's zoom field reads and types.

export type OfficeZoomValue = number | 'fit';

export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_DEFAULT: OfficeZoomValue = 100;
/** Google's levels, as a spreadsheet lists them. */
export const ZOOM_PERCENTS: readonly number[] = [50, 75, 90, 100, 125, 150, 200];
/** Google's list for a document's pages: Fit, then the levels. */
export const ZOOM_PRESETS: readonly OfficeZoomValue[] = ['fit', ...ZOOM_PERCENTS];

export const isZoomPercent = (n: number): boolean =>
  Number.isInteger(n) && n >= ZOOM_MIN && n <= ZOOM_MAX;

/** A typed zoom, or null when it is not a whole number from 50 to 200 (a % sign may follow). */
export function parseZoomText(text: string): number | null {
  const match = /^\s*(\d{1,3})\s*%?\s*$/.exec(text);
  if (!match) return null;
  const n = Number(match[1]);
  return isZoomPercent(n) ? n : null;
}

/** The scale: the percentage, or for Fit `pageWidthPx` fitted to `availablePx`, never above 200%. */
export function zoomScale(zoom: OfficeZoomValue, availablePx: number, pageWidthPx: number): number {
  if (zoom === 'fit') return Math.min(ZOOM_MAX / 100, availablePx / pageWidthPx);
  return zoom / 100;
}

export const zoomLabel = (zoom: OfficeZoomValue): string => (zoom === 'fit' ? 'Fit' : `${zoom}%`);

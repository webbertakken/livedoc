// docs/specs/035-pdf-documents/reading-surface.md "The pages" (Page display, Zoom, The view is the person's), "The
// page bar", "Limits": a person's view of a PDF document, as a value.
import { describe, expect, it } from 'vitest';
import { PDF_ZOOM_MAX, PDF_ZOOM_MIN, PDF_ZOOM_STEPS } from '@livedoc/pdf-documents';
import { PdfView } from './pdf-view';

describe("a person's view of a PDF document", () => {
  // "The view is the person's": a PDF opens in Continuous at Fit width.
  it('opens in Continuous at Fit width, one page across, no cover page', () => {
    expect(PdfView.initial()).toEqual({
      zoom: 'fit-width',
      display: { across: 1, continuous: true, cover: false },
    });
  });

  // "Page display": continuous or one row at a time; one or two pages across.
  it('names the four page displays', () => {
    const named = (across: 1 | 2, continuous: boolean) =>
      PdfView.displayName({ across, continuous, cover: false });
    expect(named(1, false)).toBe('single');
    expect(named(1, true)).toBe('continuous');
    expect(named(2, false)).toBe('two');
    expect(named(2, true)).toBe('two-continuous');
  });

  it('takes a page display by its name and keeps the cover page and the zoom', () => {
    const before: PdfView = { zoom: 1.5, display: { across: 1, continuous: true, cover: true } };
    expect(PdfView.withDisplay(before, 'two')).toEqual({
      zoom: 1.5,
      display: { across: 2, continuous: false, cover: true },
    });
    expect(PdfView.displayName(PdfView.withDisplay(before, 'single').display)).toBe('single');
    expect(PdfView.withDisplay(before, 'two-continuous').display.continuous).toBe(true);
    expect(PdfView.withDisplay(before, 'continuous')).toEqual(before);
  });

  it('shows and hides the cover page and keeps the rest', () => {
    const before = PdfView.withDisplay(PdfView.initial(), 'two');
    const shown = PdfView.withCover(before, true);
    expect(shown.display).toEqual({ across: 2, continuous: false, cover: true });
    expect(PdfView.withCover(shown, false)).toEqual(before);
  });

  // "Limits": PDF_ZOOM_MIN, PDF_ZOOM_MAX, 10% to 6400%.
  it('keeps a zoom within 10% and 6400%', () => {
    expect(PdfView.withZoom(PdfView.initial(), 0.01).zoom).toBe(PDF_ZOOM_MIN);
    expect(PdfView.withZoom(PdfView.initial(), 500).zoom).toBe(PDF_ZOOM_MAX);
    expect(PdfView.withZoom(PdfView.initial(), 1.25).zoom).toBe(1.25);
    expect(PdfView.withZoom(PdfView.withZoom(PdfView.initial(), 3), 'fit-page').zoom).toBe(
      'fit-page',
    );
  });

  // "Zoom in and Zoom out go to the next of PDF_ZOOM_STEPS above or below the zoom shown, whichever zoom that was."
  it('steps in and out through the steps, from any zoom shown', () => {
    expect(PdfView.stepIn(1)).toBe(1.25);
    expect(PdfView.stepOut(1)).toBe(0.75);
    // A fitted zoom between two steps goes to the step either side.
    expect(PdfView.stepIn(1.1736)).toBe(1.25);
    expect(PdfView.stepOut(1.1736)).toBe(1);
    // A float a hair off a step is that step, never a step onto itself.
    expect(PdfView.stepIn(1.2500000001)).toBe(1.5);
    expect(PdfView.stepOut(0.7499999999)).toBe(0.667);
  });

  it('stops at the ends', () => {
    expect(PdfView.stepIn(PDF_ZOOM_MAX)).toBe(PDF_ZOOM_MAX);
    expect(PdfView.stepOut(PDF_ZOOM_MIN)).toBe(PDF_ZOOM_MIN);
    expect(PdfView.stepIn(40)).toBe(PDF_ZOOM_MAX);
    expect(PdfView.stepOut(0.11)).toBe(PDF_ZOOM_MIN);
    expect(PDF_ZOOM_STEPS[0]).toBe(PDF_ZOOM_MIN);
    expect(PDF_ZOOM_STEPS.at(-1)).toBe(PDF_ZOOM_MAX);
    expect(PDF_ZOOM_STEPS.toSorted((a, b) => a - b)).toEqual(PDF_ZOOM_STEPS);
  });

  // "The page bar": Zoom shows the zoom as a percentage whichever zoom it is.
  it('writes a scale as a percentage, with one decimal only under 100% where it has one', () => {
    expect(PdfView.percent(1)).toBe('100%');
    expect(PdfView.percent(1.1736)).toBe('117%');
    expect(PdfView.percent(0.125)).toBe('12.5%');
    expect(PdfView.percent(0.333)).toBe('33.3%');
    expect(PdfView.percent(0.5)).toBe('50%');
    expect(PdfView.percent(64)).toBe('6400%');
  });

  // "The page bar": Zoom takes 10 to 6400, with or without a "%".
  it('reads a typed zoom from 10 to 6400, with or without a per cent sign', () => {
    expect(PdfView.parseZoom('125')).toBe(1.25);
    expect(PdfView.parseZoom(' 125 % ')).toBe(1.25);
    expect(PdfView.parseZoom('33.3%')).toBeCloseTo(0.333, 6);
    expect(PdfView.parseZoom('12,5')).toBe(0.125);
    expect(PdfView.parseZoom('10')).toBe(0.1);
    expect(PdfView.parseZoom('6400')).toBe(64);
  });

  it('reads nothing from what is no zoom', () => {
    for (const text of ['', '9', '6401', 'fit', '-50', '1e3', '12.345', '50%%', '５０'])
      expect(PdfView.parseZoom(text), text).toBeNull();
  });

  // "The page bar": a typed page that is no page of the file.
  it('reads a typed page number as a page of the file, or as none', () => {
    expect(PdfView.parsePage('3', 14)).toBe(2);
    expect(PdfView.parsePage(' 14 ', 14)).toBe(13);
    expect(PdfView.parsePage('1', 14)).toBe(0);
    for (const text of ['0', '15', '', 'iv', '2.5', '-1', '1e1'])
      expect(PdfView.parsePage(text, 14), text).toBeNull();
  });
});

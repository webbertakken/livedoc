// docs/specs/035-pdf-documents/reading-surface.md "View" (Page display, Zoom, Go to), "The toolbar" (Page display),
// "The pages" (Zoom in and Zoom out step from the zoom shown), "Telemetry" (how a zoom was asked for).
import { describe, expect, it, vi } from 'vitest';
import {
  GO_TO_FIRST_PAGE,
  GO_TO_LAST_PAGE,
  GO_TO_NEXT_PAGE,
  GO_TO_PREVIOUS_PAGE,
  ROTATE_VIEW_CLOCKWISE,
  ROTATE_VIEW_COUNTERCLOCKWISE,
  PAGE_DISPLAY_CONTINUOUS,
  PAGE_DISPLAY_COVER,
  PAGE_DISPLAY_SINGLE,
  PAGE_DISPLAY_TWO,
  PAGE_DISPLAY_TWO_CONTINUOUS,
  ZOOM_ACTUAL_SIZE,
  ZOOM_FIT_PAGE,
  ZOOM_FIT_WIDTH,
  ZOOM_IN,
  ZOOM_OUT,
  zoomPercentId,
} from './pdf-menus';
import { PAGE_DISPLAY_CONTROL } from './pdf-toolbar';
import { pdfViewActions } from './pdf-view-actions';
import { PdfView, type PdfView as View } from './pdf-view';

function viewer(over: { view?: View; scale?: number; atFirst?: boolean; atLast?: boolean } = {}) {
  return {
    view: over.view ?? PdfView.initial(),
    scale: over.scale ?? 1.17,
    page: 3,
    count: 9,
    atFirst: over.atFirst ?? false,
    atLast: over.atLast ?? false,
    zoomTo: vi.fn(),
    goToPage: vi.fn(),
    turn: vi.fn(),
    setDisplay: vi.fn(),
    setCover: vi.fn(),
    rotate: vi.fn(),
  };
}

describe('View > Page display', () => {
  it('sets each of the four displays and checks the one shown', () => {
    const at = viewer();
    const { actions } = pdfViewActions(at);
    expect(actions[PAGE_DISPLAY_CONTINUOUS]?.checked).toBe(true);
    expect(actions[PAGE_DISPLAY_SINGLE]?.checked).toBe(false);
    actions[PAGE_DISPLAY_SINGLE]!.run();
    actions[PAGE_DISPLAY_TWO]!.run();
    actions[PAGE_DISPLAY_TWO_CONTINUOUS]!.run();
    expect(at.setDisplay.mock.calls).toEqual([['single'], ['two'], ['two-continuous']]);
  });

  it('shows and hides the cover page', () => {
    const at = viewer();
    pdfViewActions(at).actions[PAGE_DISPLAY_COVER]!.run();
    expect(at.setCover).toHaveBeenCalledWith(true);
    const covered = viewer({ view: PdfView.withCover(PdfView.initial(), true) });
    const { actions } = pdfViewActions(covered);
    expect(actions[PAGE_DISPLAY_COVER]?.checked).toBe(true);
    actions[PAGE_DISPLAY_COVER]!.run();
    expect(covered.setCover).toHaveBeenCalledWith(false);
  });

  // "The toolbar": Viewing's Page display lists View > Page display's items and says the one shown.
  it('is the toolbar’s Page display list too', () => {
    const view = PdfView.withDisplay(PdfView.initial(), 'two');
    const { choices, actions } = pdfViewActions(viewer({ view }));
    const list = choices[PAGE_DISPLAY_CONTROL]!;
    expect(list.read()).toBe('Two pages');
    expect(list.actions).toBe(actions);
    expect(list.entries.flatMap((entry) => (entry.kind === 'item' ? [entry.label] : []))).toEqual([
      'Single page',
      'Continuous',
      'Two pages',
      'Two pages, continuous',
      'Show cover page',
    ]);
  });
});

describe('View > Zoom', () => {
  it('steps in and out from the zoom shown, whichever zoom it is', () => {
    const at = viewer({ scale: 1.17 });
    const { actions } = pdfViewActions(at);
    actions[ZOOM_IN]!.run();
    actions[ZOOM_OUT]!.run();
    expect(at.zoomTo.mock.calls).toEqual([
      [1.25, 'In'],
      [1, 'Out'],
    ]);
  });

  it('dims Zoom in at 6400% and Zoom out at 10%', () => {
    expect(pdfViewActions(viewer({ scale: 64 })).actions[ZOOM_IN]?.disabled).toBe(true);
    expect(pdfViewActions(viewer({ scale: 0.1 })).actions[ZOOM_OUT]?.disabled).toBe(true);
    expect(pdfViewActions(viewer({ scale: 1 })).actions[ZOOM_IN]?.disabled).toBe(false);
  });

  it('fits the width, fits the page, shows actual size and each percentage, checking the zoom in force', () => {
    const at = viewer();
    const { actions } = pdfViewActions(at);
    expect(actions[ZOOM_FIT_WIDTH]?.checked).toBe(true);
    actions[ZOOM_FIT_WIDTH]!.run();
    actions[ZOOM_FIT_PAGE]!.run();
    actions[ZOOM_ACTUAL_SIZE]!.run();
    actions[zoomPercentId(400)]!.run();
    expect(at.zoomTo.mock.calls).toEqual([
      ['fit-width', 'FitWidth'],
      ['fit-page', 'FitPage'],
      [1, 'Actual'],
      [4, 'Custom'],
    ]);
    const fourHundred = pdfViewActions(viewer({ view: PdfView.withZoom(PdfView.initial(), 4) }));
    expect(fourHundred.actions[zoomPercentId(400)]?.checked).toBe(true);
    expect(fourHundred.actions[ZOOM_FIT_WIDTH]?.checked).toBe(false);
    // 100% is Actual size: the one check.
    const actual = pdfViewActions(viewer({ view: PdfView.withZoom(PdfView.initial(), 1) }));
    expect(actual.actions[ZOOM_ACTUAL_SIZE]?.checked).toBe(true);
    expect(actual.actions[zoomPercentId(100)]?.checked).toBe(false);
  });
});

// "Rotate view": Clockwise and Counterclockwise, a quarter each, for this person only.
describe('View > Rotate view', () => {
  it('turns every page a quarter clockwise or counterclockwise', () => {
    const at = viewer();
    const { actions } = pdfViewActions(at);
    actions[ROTATE_VIEW_CLOCKWISE]!.run();
    actions[ROTATE_VIEW_COUNTERCLOCKWISE]!.run();
    expect(at.rotate.mock.calls).toEqual([[1], [-1]]);
  });
});

describe('View > Go to', () => {
  it('goes to the first and the last page, and turns a row back and on', () => {
    const at = viewer();
    const { actions } = pdfViewActions(at);
    actions[GO_TO_FIRST_PAGE]!.run();
    actions[GO_TO_LAST_PAGE]!.run();
    expect(at.goToPage.mock.calls).toEqual([[0], [8]]);
    actions[GO_TO_PREVIOUS_PAGE]!.run();
    actions[GO_TO_NEXT_PAGE]!.run();
    expect(at.turn.mock.calls).toEqual([[-1], [1]]);
  });

  it('dims the moves that have nowhere to go', () => {
    const first = pdfViewActions(viewer({ atFirst: true })).actions;
    expect([first[GO_TO_FIRST_PAGE]?.disabled, first[GO_TO_PREVIOUS_PAGE]?.disabled]).toEqual([
      true,
      true,
    ]);
    const last = pdfViewActions(viewer({ atLast: true })).actions;
    expect([last[GO_TO_LAST_PAGE]?.disabled, last[GO_TO_NEXT_PAGE]?.disabled]).toEqual([
      true,
      true,
    ]);
  });
});

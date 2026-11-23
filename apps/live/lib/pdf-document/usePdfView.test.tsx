// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages" (Page display, Zoom, The view is the person's), "The page
// bar" (the page in view), "Telemetry": a person's view of the pages, and the place each change keeps.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageName, type PageInfo } from '@livedoc/pdf-documents';
import { track } from '@/lib/telemetry';
import { PdfPageLayout } from './pdf-page-layout';
import { usePdfView } from './usePdfView';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

// US Letter: 816 by 1,056 CSS pixels at 100%.
const PAGES: readonly PageInfo[] = Array.from({ length: 6 }, (_, at) => ({
  name: PageName.ofObject(at + 1),
  width: 612,
  height: 792,
  rotation: 0,
  label: null,
}));
const VIEW = { width: 1000, height: 800 };

class SizedObserver {
  private readonly report: () => void;
  constructor(report: () => void) {
    this.report = report;
  }
  observe() {
    this.report();
  }
  unobserve() {}
  disconnect() {}
}

function viewing() {
  const scroller = document.createElement('div');
  Object.defineProperty(scroller, 'clientWidth', { value: VIEW.width });
  Object.defineProperty(scroller, 'clientHeight', { value: VIEW.height });
  const hook = renderHook(() => usePdfView(PAGES));
  act(() => hook.result.current.attach(scroller));
  /** The pages scrolled as a person scrolls them. */
  const scrollTo = (top: number, left = 0) => {
    scroller.scrollTop = top;
    scroller.scrollLeft = left;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
  };
  return { hook, scroller, scrollTo, now: () => hook.result.current };
}

/** What lies under a point of the view, in the layout now. */
const under = (
  at: ReturnType<typeof viewing>,
  point: { x: number; y: number },
): ReturnType<typeof PdfPageLayout.placeAt> =>
  PdfPageLayout.placeAt(at.now().layout, {
    x: at.scroller.scrollLeft + point.x,
    y: at.scroller.scrollTop + point.y,
  });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', SizedObserver);
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => {
    run(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(track).mockClear();
});

describe("a person's view of the pages", () => {
  // "A PDF opens in Continuous at Fit width."
  it('opens in Continuous at Fit width, every page laid out, page one in view', () => {
    const at = viewing();
    expect(at.now().view.zoom).toBe('fit-width');
    expect(at.now().scale).toBeCloseTo((1000 - 48) / 816, 9);
    expect(at.now().layout.boxes).toHaveLength(6);
    expect([at.now().page, at.now().atFirst, at.now().atLast]).toEqual([0, true, false]);
  });

  it('follows the page under the middle of the view as it scrolls', () => {
    const at = viewing();
    const second = at.now().layout.boxes[1]!;
    at.scrollTo(second.top);
    expect(at.now().page).toBe(1);
  });

  // "A zoom from the menus, the keys or the page bar keeps the middle of the view where it is."
  it('keeps the middle of the view where it is across a zoom from the menus', () => {
    const at = viewing();
    at.scrollTo(3000);
    const middle = { x: 500, y: 400 };
    const before = under(at, middle)!;
    act(() => at.now().zoomTo(2, 'Custom'));
    expect(at.now().scale).toBe(2);
    const after = under(at, middle)!;
    expect(after.index).toBe(before.index);
    expect(after.down).toBeCloseTo(before.down, 6);
    expect(track).toHaveBeenCalledWith('Pdf', 'Zoomed', 'Custom');
  });

  // "The wheel and a pinch keep what is under the pointer."
  it('keeps what is under the pointer across a wheel’s zoom', () => {
    const at = viewing();
    at.scrollTo(2000);
    const pointer = { x: 700, y: 150 };
    const before = under(at, pointer)!;
    act(() => at.now().zoomBy(1.5, pointer));
    act(() => at.now().zoomBy(1.5, pointer));
    expect(at.now().scale).toBeCloseTo(((1000 - 48) / 816) * 2.25, 9);
    const after = under(at, pointer)!;
    expect(after.index).toBe(before.index);
    expect(after.across).toBeCloseTo(before.across, 6);
    expect(after.down).toBeCloseTo(before.down, 6);
  });

  // "A change of page display keeps the page in view."
  it('keeps the page in view across a change of display', () => {
    const at = viewing();
    at.scrollTo(at.now().layout.boxes[3]!.top);
    expect(at.now().page).toBe(3);
    act(() => at.now().setDisplay('two-continuous'));
    expect(at.now().view.display).toEqual({ across: 2, continuous: true, cover: false });
    // Page four is the right of the second row: the row's left page is the page in view.
    expect(at.now().page).toBe(2);
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'PageDisplay.TwoContinuous');
    act(() => at.now().setCover(true));
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'PageDisplay.CoverShown');
    // With a cover page, page three pairs with page four.
    expect(at.now().page).toBe(1);
  });

  it('tells nothing for a display or a cover page already shown', () => {
    const at = viewing();
    act(() => at.now().setDisplay('continuous'));
    act(() => at.now().setCover(false));
    expect(track).not.toHaveBeenCalled();
  });

  it('goes to a page, its top at the view’s top', () => {
    const at = viewing();
    act(() => at.now().goToPage(4));
    expect(at.scroller.scrollTop).toBeCloseTo(at.now().layout.boxes[4]!.top - 24, 6);
    expect(at.now().page).toBe(4);
    act(() => at.now().turn(1));
    expect(at.now().page).toBe(5);
    expect(at.now().atLast).toBe(true);
    act(() => at.now().goToPage(99));
    expect(at.now().page).toBe(5);
  });

  it('shows a page only where it is out of view', () => {
    const at = viewing();
    act(() => at.now().showPage(0));
    expect(at.scroller.scrollTop).toBe(0);
    act(() => at.now().showPage(5));
    expect(at.now().page).toBe(5);
  });
});

describe('a display of one row at a time', () => {
  // "Single page and Two pages show the row in view alone."
  it('lays out the row in view alone, and turns rows', () => {
    const at = viewing();
    act(() => at.now().setDisplay('two'));
    expect(at.now().layout.boxes.map((box) => box.index)).toEqual([0, 1]);
    act(() => at.now().turn(1));
    expect(at.now().layout.boxes.map((box) => box.index)).toEqual([2, 3]);
    expect(at.now().page).toBe(2);
    act(() => at.now().goToPage(5));
    expect(at.now().layout.boxes.map((box) => box.index)).toEqual([4, 5]);
    expect(at.now().atLast).toBe(true);
  });

  // "Pushed past its start to the row before, at its end."
  it('turns back to a row at its end', () => {
    const at = viewing();
    act(() => at.now().zoomTo(2, 'Custom'));
    act(() => at.now().setDisplay('single'));
    act(() => at.now().turn(1));
    expect(at.now().page).toBe(1);
    act(() => at.now().turn(-1, true));
    expect(at.now().page).toBe(0);
    expect(at.scroller.scrollTop).toBeCloseTo(at.now().layout.height - VIEW.height, 6);
  });
});

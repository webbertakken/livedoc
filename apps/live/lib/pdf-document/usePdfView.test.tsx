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

  // "Phone and tablet": a pinch zooms about the fingers, and two fingers pan: what was under their last middle lands
  // under their new one.
  it('puts what was under the fingers under where they moved to across a pinch', () => {
    const at = viewing();
    at.scrollTo(2000);
    const from = { x: 400, y: 300 };
    const to = { x: 450, y: 260 };
    const before = under(at, from)!;
    act(() => at.now().zoomBy(1.25, from, to));
    const after = under(at, to)!;
    expect(after.index).toBe(before.index);
    expect(after.across).toBeCloseTo(before.across, 6);
    expect(after.down).toBeCloseTo(before.down, 6);
  });

  it('still pans when a pinch cannot zoom further', () => {
    const at = viewing();
    act(() => at.now().zoomTo(64, 'Custom'));
    at.scrollTo(5000, 5000);
    act(() => at.now().zoomBy(2, { x: 400, y: 300 }, { x: 380, y: 290 }));
    expect(at.scroller.scrollLeft).toBe(5020);
    expect(at.scroller.scrollTop).toBe(5010);
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

  // "Following a link": a place's point at the view's top left; "Previous view": the place there, read back.
  it('goes to a place on a page, and reads the place at the view’s top left', () => {
    const at = viewing();
    act(() => at.now().goToPage(4, { across: 0, down: 0.5 }));
    const box = at.now().layout.boxes[4]!;
    expect(at.scroller.scrollTop).toBeCloseTo(box.top + box.height / 2 - 24, 6);
    const place = at.now().placeInView()!;
    expect([place.index, place.down]).toEqual([4, expect.closeTo(0.5, 6)]);
  });

  it('shows a page only where it is out of view', () => {
    const at = viewing();
    act(() => at.now().showPage(0));
    expect(at.scroller.scrollTop).toBe(0);
    act(() => at.now().showPage(5));
    expect(at.now().page).toBe(5);
  });
});

// "Rotate view": every page a quarter, drawn turned; a turn keeps the page in view, its top at the view's top.
describe('Rotate view', () => {
  it('lays every page on its side for a quarter turn, and keeps the page in view', () => {
    const at = viewing();
    act(() => at.now().goToPage(3));
    act(() => at.now().rotate(1));
    expect(at.now().view.turns).toBe(1);
    const box = at.now().layout.boxes[3]!;
    // US Letter turned: 1,056 wide by 816 tall at 100%, fitted to the view's width.
    expect(box.width / box.height).toBeCloseTo(792 / 612, 6);
    expect(at.now().scale).toBeCloseTo((1000 - 48) / 1056, 9);
    expect(at.now().page).toBe(3);
    expect(at.scroller.scrollTop).toBeCloseTo(box.top - 24, 6);
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'RotateView.Clockwise');
    act(() => at.now().rotate(-1));
    expect(at.now().view.turns).toBe(0);
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'RotateView.Counterclockwise');
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

  // "Following a link" in one row at a time: the place's row shown, the place at the view's top left.
  it('shows the row of a place gone to, the place at the view’s top left', () => {
    const at = viewing();
    act(() => at.now().zoomTo(2, 'Custom'));
    act(() => at.now().setDisplay('single'));
    act(() => at.now().goToPage(3, { across: 0, down: 0.5 }));
    expect(at.now().layout.boxes.map((box) => box.index)).toEqual([3]);
    const box = at.now().layout.boxes[0]!;
    expect(at.scroller.scrollTop).toBeCloseTo(box.top + box.height / 2 - 24, 6);
    // A place on the row in view is scrolled to, the row kept.
    act(() => at.now().goToPage(3, { across: 0, down: 0.25 }));
    expect(at.scroller.scrollTop).toBeCloseTo(box.top + box.height / 4 - 24, 6);
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

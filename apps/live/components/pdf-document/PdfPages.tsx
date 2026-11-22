'use client';

// The pages of a PDF document (docs/specs/035-pdf-documents/reading-surface.md "The pages"): every page a box of its
// true size, read before anything is drawn, so the scrollbar is true from the first frame; only pages near view hold
// a picture, and a page far from view lets its picture go.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import type { PageInfo, PdfEngine, TextSelection } from '@livedoc/pdf-documents';
import { zoomScale, type OfficeZoomValue } from '@/lib/office/office-zoom';
import { marksOnPage, type PdfMarksStore } from '@/lib/pdf-document/pdf-marks-store';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import { PdfPage, type PdfPageTool } from './PdfPage';

// A point is 1/72 inch and a CSS pixel 1/96: at 100% a page shows at its true size.
const CSS_PER_POINT = 96 / 72;
// The ground left and right of the widest page at Fit, in CSS pixels.
const GUTTER_PX = 24;
// A page is drawn once it is within one viewport of view, and keeps its picture until it is three away
// (reading-surface.md "The pages": memory is bounded). Safe ranges: 50% to 200%, and 200% to 600%.
const NEAR_MARGIN = '100% 0px';
const HELD_MARGIN = '300% 0px';
// The page in view is the one under the middle of the view (live-editing-and-storage.md "Presence"): the view drawn
// in to a line across its middle, so no scroll is listened to and no layout read.
const MIDDLE_MARGIN = '-50% 0px';

function useWidth(element: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    // An observer reports the size it starts with, so the first width needs no read of its own.
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, [element]);
  return width;
}

// Which pages lie within `margin` of the scroller's view.
function usePagesWithin(
  scroller: RefObject<HTMLElement | null>,
  margin: string,
): { within: ReadonlySet<number>; watch: (index: number, element: HTMLElement | null) => void } {
  const [within, setWithin] = useState<ReadonlySet<number>>(new Set());
  const observer = useRef<IntersectionObserver | null>(null);
  const elements = useRef(new Map<number, HTMLElement>());
  useEffect(() => {
    const made = new IntersectionObserver(
      (entries) =>
        setWithin((before) => {
          const next = new Set(before);
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.pdfPage) - 1;
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        }),
      { root: scroller.current, rootMargin: margin },
    );
    observer.current = made;
    for (const element of elements.current.values()) made.observe(element);
    return () => made.disconnect();
  }, [scroller, margin]);
  const watch = useCallback((index: number, element: HTMLElement | null) => {
    const before = elements.current.get(index);
    if (before === element) return;
    if (before) observer.current?.unobserve(before);
    if (element) {
      elements.current.set(index, element);
      observer.current?.observe(element);
    } else elements.current.delete(index);
  }, []);
  return { within, watch };
}

export function PdfPages({
  scroller,
  pages,
  zoom,
  engine,
  drawer,
  marks,
  tool,
  onHighlight,
  onPageInView,
}: {
  scroller: RefObject<HTMLDivElement | null>;
  pages: readonly PageInfo[];
  zoom: OfficeZoomValue;
  engine: Pick<PdfEngine, 'selectText' | 'fileMarks'>;
  drawer: PdfPageDrawer;
  marks: PdfMarksStore;
  tool: PdfPageTool;
  onHighlight: (index: number, selection: TextSelection) => void;
  // Told the page in view, by its index, as it changes.
  onPageInView?: (index: number) => void;
}) {
  const width = useWidth(scroller);
  const widest = useMemo(() => Math.max(...pages.map((page) => page.width), 1), [pages]);
  const cssPerPoint =
    zoomScale(zoom, Math.max(width - 2 * GUTTER_PX, 1), widest * CSS_PER_POINT) * CSS_PER_POINT;
  const near = usePagesWithin(scroller, NEAR_MARGIN);
  const held = usePagesWithin(scroller, HELD_MARGIN);
  const middle = usePagesWithin(scroller, MIDDLE_MARGIN);
  const { watch: watchNear } = near;
  const { watch: watchHeld } = held;
  const { watch: watchMiddle, within: underMiddle } = middle;
  const register = useCallback(
    (index: number, element: HTMLElement | null) => {
      watchNear(index, element);
      watchHeld(index, element);
      watchMiddle(index, element);
    },
    [watchNear, watchHeld, watchMiddle],
  );
  useEffect(() => {
    // Between two pages nothing lies under the middle: the page last under it stands.
    if (underMiddle.size > 0) onPageInView?.(Math.min(...underMiddle));
  }, [underMiddle, onPageInView]);
  const byPage = useSyncExternalStore(marks.subscribe, marks.get, marks.get);

  return (
    <div
      ref={scroller}
      // The pages take the keys: the tools' own, and the arrows that scroll.
      tabIndex={0}
      data-pdf-pages={pages.length}
      className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-inset"
    >
      {/* `w-max min-w-full`: a page wider than the window scrolls sideways instead of being cut on its left. */}
      <div className="flex w-max min-w-full flex-col items-center gap-4 px-6 py-6">
        {width > 0
          ? pages.map((page, index) => (
              <PdfPage
                key={page.name}
                index={index}
                count={pages.length}
                page={page}
                cssPerPoint={cssPerPoint}
                wanted={near.within.has(index)}
                held={held.within.has(index)}
                engine={engine}
                drawer={drawer}
                marks={marksOnPage(byPage, page.name)}
                tool={tool}
                onHighlight={onHighlight}
                register={register}
              />
            ))
          : null}
      </div>
    </div>
  );
}

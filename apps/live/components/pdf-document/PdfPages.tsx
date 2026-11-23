'use client';

// The pages of a PDF document (docs/specs/035-pdf-documents/reading-surface.md "The pages"): every page laid out where
// the person's view puts it (usePdfView.ts, pdf-page-layout.ts), a box of its true size read before anything is
// drawn, so the scrollbar is true from the first frame; only pages near view hold a picture, and a page far from view
// lets its picture go.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { PageInfo, PageTurns, PdfEngine, TextSelection } from '@livedoc/pdf-documents';
import { CSS_PER_POINT, type PdfPageLayout } from '@/lib/pdf-document/pdf-page-layout';
import { marksOnPage, type PdfMarksStore } from '@/lib/pdf-document/pdf-marks-store';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import { PdfPage, type PdfPageTool } from './PdfPage';

// A page is drawn once it is within one viewport of view, and keeps its picture until it is three away
// (reading-surface.md "The pages": memory is bounded). Safe ranges: 50% to 200%, and 200% to 600%.
const NEAR_MARGIN = '100% 0px';
const HELD_MARGIN = '300% 0px';
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
  attach,
  layout,
  scale,
  turns,
  sized,
  onKeyDown,
  pages,
  engine,
  drawer,
  marks,
  tool,
  onHighlight,
}: {
  // Hands the scroller to the view that lays the pages out and scrolls them.
  attach: (element: HTMLDivElement | null) => void;
  // Where every page shown lies, at `scale` (1 is 100%).
  layout: PdfPageLayout;
  scale: number;
  // Rotate view's turn, in quarters clockwise.
  turns: PageTurns;
  // The view has a size: until it has, no page is drawn at a scale fitted to nothing.
  sized: boolean;
  // The pages' own keys (usePdfPagesInput.ts).
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  pages: readonly PageInfo[];
  engine: Pick<PdfEngine, 'selectText' | 'fileMarks'>;
  drawer: PdfPageDrawer;
  marks: PdfMarksStore;
  tool: PdfPageTool;
  onHighlight: (index: number, selection: TextSelection) => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element;
      attach(element);
    },
    [attach],
  );
  const cssPerPoint = scale * CSS_PER_POINT;
  const near = usePagesWithin(scroller, NEAR_MARGIN);
  const held = usePagesWithin(scroller, HELD_MARGIN);
  const { watch: watchNear } = near;
  const { watch: watchHeld } = held;
  const register = useCallback(
    (index: number, element: HTMLElement | null) => {
      watchNear(index, element);
      watchHeld(index, element);
    },
    [watchNear, watchHeld],
  );
  const byPage = useSyncExternalStore(marks.subscribe, marks.get, marks.get);

  return (
    <div
      ref={ref}
      // The pages take the keys: the tools' own, the arrows that scroll and the keys that turn a page.
      tabIndex={0}
      data-pdf-pages={pages.length}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-inset"
    >
      {/* The layout places every page itself, centred in a view wider or taller than the pages. */}
      <div className="relative" style={{ width: layout.width, height: layout.height }}>
        {sized
          ? layout.boxes.map((box) => {
              const page = pages[box.index]!;
              return (
                <PdfPage
                  key={page.name}
                  index={box.index}
                  count={pages.length}
                  page={page}
                  cssPerPoint={cssPerPoint}
                  left={box.left}
                  top={box.top}
                  turns={turns}
                  wanted={near.within.has(box.index)}
                  held={held.within.has(box.index)}
                  engine={engine}
                  drawer={drawer}
                  marks={marksOnPage(byPage, page.name)}
                  tool={tool}
                  onHighlight={onHighlight}
                  register={register}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

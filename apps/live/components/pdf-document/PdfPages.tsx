'use client';

// The pages of a PDF document (docs/specs/035-pdf-documents/reading-surface.md "The pages"): every page laid out where
// the person's view puts it (usePdfView.ts, pdf-page-layout.ts), a box of its true size read before anything is
// drawn, so the scrollbar is true from the first frame; only pages near view hold a picture, and a page far from view
// lets its picture go.
import { useCallback, useMemo, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import type { PageInfo, PageTurns, PdfEngine, Quad, TextSelection } from '@livedoc/pdf-documents';
import { CSS_PER_POINT, type PdfPageLayout } from '@/lib/pdf-document/pdf-page-layout';
import { marksOnPage, type PdfMarksStore } from '@/lib/pdf-document/pdf-marks-store';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import { PdfDevice } from '@/lib/pdf-document/pdf-device';
import { pdfTileCache } from '@/lib/pdf-document/pdf-tile-cache';
import type { PdfViewStore } from '@/lib/pdf-document/usePdfView';
import { HELD_MARGIN, NEAR_MARGIN, useWithin } from '@/lib/pdf-document/useWithin';
import type { PdfTileSource } from './PdfPageTiles';
import { PdfPage, type PdfPageTool } from './PdfPage';
import type { PdfTextGesture, PdfTextSelected } from '@/lib/pdf-document/usePdfTextSelection';

const NOTHING_SELECTED: readonly Quad[] = [];

export function PdfPages({
  attach,
  layout,
  scale,
  turns,
  viewStore,
  sized,
  onKeyDown,
  pages,
  engine,
  drawer,
  marks,
  tool,
  onHighlight,
  selection,
  onText,
}: {
  // Hands the scroller to the view that lays the pages out and scrolls them.
  attach: (element: HTMLDivElement | null) => void;
  // Where every page shown lies, at `scale` (1 is 100%).
  layout: PdfPageLayout;
  scale: number;
  // Rotate view's turn, in quarters clockwise.
  turns: PageTurns;
  // The part of the layout in view, for the pages' tiles.
  viewStore: PdfViewStore;
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
  // The person's text selection, and where a page's gestures go (usePdfTextSelection.ts).
  selection: PdfTextSelected | null;
  onText: (index: number, gesture: PdfTextGesture) => void;
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
  const near = useWithin(scroller, NEAR_MARGIN);
  const held = useWithin(scroller, HELD_MARGIN);
  const { watch: watchNear } = near;
  const { watch: watchHeld } = held;
  const register = useCallback(
    (index: number, element: HTMLElement | null) => {
      watchNear(index, element);
      watchHeld(index, element);
    },
    [watchNear, watchHeld],
  );
  // A surface's tiles, kept to this device's budget; a replaced stored file comes with another drawer, and new tiles.
  const tiles = useMemo<PdfTileSource>(() => {
    const device = PdfDevice.current();
    return {
      drawer,
      cache: pdfTileCache(PdfDevice.tileBudget(device)),
      view: viewStore,
      pixelRatio: PdfDevice.tilePixelRatio(device, window.devicePixelRatio || 1),
    };
  }, [drawer, viewStore]);
  const byPage = useSyncExternalStore(marks.subscribe, marks.get, marks.get);

  return (
    <div
      ref={ref}
      // The pages take the keys: the tools' own, the arrows that scroll and the keys that turn a page.
      tabIndex={0}
      data-region="document"
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
                  tiles={tiles}
                  wanted={near.within.has(box.index)}
                  held={held.within.has(box.index)}
                  engine={engine}
                  drawer={drawer}
                  marks={marksOnPage(byPage, page.name)}
                  tool={tool}
                  onHighlight={onHighlight}
                  selected={selection?.page === box.index ? selection.quads : NOTHING_SELECTED}
                  onText={onText}
                  register={register}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

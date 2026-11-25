'use client';

// The pages of a PDF document (docs/specs/035-pdf-documents/reading-surface.md "The pages"): every page laid out where
// the person's view puts it (usePdfView.ts, pdf-page-layout.ts), a box of its true size read before anything is
// drawn, so the scrollbar is true from the first frame; only pages near view hold a picture, and a page far from view
// lets its picture go.
import { useCallback, useMemo, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import type {
  LinkTarget,
  PageInfo,
  PageTurns,
  PdfEngine,
  Quad,
  TextSelection,
} from '@livedoc/pdf-documents';
import { pdfLinkName } from '@/lib/pdf-document/pdf-link';
import { CSS_PER_POINT, type PdfPageLayout } from '@/lib/pdf-document/pdf-page-layout';
import { changeableOnPage, type PdfChangeableStore } from '@/lib/pdf-document/pdf-changeable-marks';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import { PdfDevice } from '@/lib/pdf-document/pdf-device';
import { pdfTileCache } from '@/lib/pdf-document/pdf-tile-cache';
import type { PdfViewStore } from '@/lib/pdf-document/usePdfView';
import { HELD_MARGIN, NEAR_MARGIN, useWithin } from '@/lib/pdf-document/useWithin';
import type { PdfTileSource } from './PdfPageTiles';
import type { PdfPageInk, PdfPageTool } from '@/lib/pdf-document/usePdfMarkTools';
import type { PdfPageShaping } from '@/lib/pdf-document/usePdfPageShape';
import type { PdfPageStamping } from '@/lib/pdf-document/usePdfStampTool';
import type { PdfPageTyping } from '@/lib/pdf-document/usePdfTyping';
import { PdfPage } from './PdfPage';
import type { PdfTextGesture, PdfTextSelected } from '@/lib/pdf-document/usePdfTextSelection';
import type { PdfFindTints } from '@/lib/pdf-document/usePdfFind';
import type { PdfPageTexts } from '@/lib/pdf-document/pdf-page-texts';
import type { PdfPageTap } from '@/lib/pdf-document/usePdfColumnZoom';
import type { PdfMarksChosen, PdfPageChoosing } from '@/lib/pdf-document/usePdfMarkSelection';

const NOTHING_SELECTED: readonly Quad[] = [];
const NO_MARKS_CHOSEN: readonly string[] = [];

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
  onMark,
  ink,
  shaping,
  stamping,
  typing,
  selection,
  chosen,
  choosing,
  onText,
  texts,
  onFollow,
  found,
  onDoubleTap,
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
  engine: Pick<PdfEngine, 'selectText' | 'fileMarks' | 'links'>;
  drawer: PdfPageDrawer;
  // The marks a person may change, by page: LiveDoc's and the file's own read as each page is drawn.
  marks: PdfChangeableStore;
  tool: PdfPageTool;
  onMark: (index: number, selection: TextSelection) => void;
  ink: PdfPageInk | null;
  // A shape tool's look and where its lines and shapes go; null while another tool is in hand.
  shaping: PdfPageShaping | null;
  stamping: PdfPageStamping | null;
  // The Text or the Callout tool's look and where its marks go; null while another tool is in hand.
  typing: PdfPageTyping | null;
  // The person's text selection, and where a page's gestures go (usePdfTextSelection.ts).
  selection: PdfTextSelected | null;
  // The marks selected, and where a press on a mark goes (usePdfMarkSelection.ts); null while marks may not change.
  chosen: PdfMarksChosen | null;
  choosing: PdfPageChoosing | null;
  onText: (index: number, gesture: PdfTextGesture) => void;
  // The pages' text, as the selection reads it: what each page near view reads to assistive technology.
  texts: PdfPageTexts | null;
  // Where a press on a page's link goes (usePdfLinks.ts).
  onFollow: (target: LinkTarget) => void;
  // Find's results, by page.
  found: ReadonlyMap<number, PdfFindTints>;
  // Where a finger's double tap on a page goes (usePdfColumnZoom.ts).
  onDoubleTap: (index: number, tap: PdfPageTap) => void;
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
  const linkName = useCallback((target: LinkTarget) => pdfLinkName(target, pages), [pages]);

  return (
    <div
      ref={ref}
      // The pages take the keys: the tools' own, the arrows that scroll and the keys that turn a page.
      tabIndex={0}
      data-region="document"
      data-pdf-pages={pages.length}
      onKeyDown={onKeyDown}
      // One finger scrolls; two pinch and pan the pages themselves, never the page around them (usePdfTouchZoom.ts).
      className="min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-inset"
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
                  marks={changeableOnPage(byPage, page.name)}
                  onFileMarks={marks.putFileMarks}
                  tool={tool}
                  onMark={onMark}
                  ink={ink}
                  shaping={shaping}
                  stamping={stamping}
                  typing={typing}
                  selected={selection?.page === box.index ? selection.quads : NOTHING_SELECTED}
                  handles={selection?.page === box.index && selection.touch}
                  chosen={chosen?.page === box.index ? chosen.ids : NO_MARKS_CHOSEN}
                  choosing={choosing}
                  onText={onText}
                  texts={texts}
                  linkName={linkName}
                  onFollow={onFollow}
                  found={found.get(box.index) ?? null}
                  onDoubleTap={onDoubleTap}
                  register={register}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

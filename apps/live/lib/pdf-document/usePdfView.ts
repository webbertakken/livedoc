'use client';

// A person's view of a PDF document's pages (docs/specs/035-pdf-documents/reading-surface.md "The pages", "The page
// bar"): the page display, the zoom and the row shown, where every page then lies (pdf-page-layout.ts), the page in
// view, and the moves between pages. The view is the person's own, kept while the surface is open and never stored.
// A change that lays the pages out again keeps a place where it was: the page in view for a change of display, the
// point under the pointer for a wheel's zoom, the middle of the view for any other.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PageInfo } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { PdfPageLayout, type PdfPoint, type PdfRow, type PdfViewport } from './pdf-page-layout';
import type { PdfLayoutRect } from './pdf-tiles';
import { PdfView, type PdfPageDisplayName, type PdfZoom } from './pdf-view';

/** How a zoom was asked for, as telemetry names it (reading-surface.md "Telemetry"). */
export type PdfZoomWay = 'FitWidth' | 'FitPage' | 'Actual' | 'In' | 'Out' | 'Custom';

const DISPLAY_TELEMETRY: Record<PdfPageDisplayName, string> = {
  single: 'Single',
  continuous: 'Continuous',
  two: 'Two',
  'two-continuous': 'TwoContinuous',
};

// What the next layout keeps in place: a point of the view (the place under it stays under it), a page (its top at
// the view's top), or the shown row's end (a row turned back to, from its start).
type Anchor =
  | { kind: 'focus'; focus: PdfPoint }
  | { kind: 'page'; index: number; at?: PdfSpot }
  | { kind: 'row-end' };

/** A point of a page as fractions of its width and height from its top left (a link's place). */
export type PdfSpot = { readonly across: number; readonly down: number };

const TOP: PdfSpot = { across: 0, down: 0 };

type Scroll = { left: number; top: number };

export type PdfViewer = ReturnType<typeof usePdfView>;

/** The part of the layout in view, read on demand and told as it moves (useSyncExternalStore's shape). */
export type PdfViewStore = {
  get: () => PdfLayoutRect;
  subscribe: (watcher: () => void) => () => void;
};

const firstOf = (row: PdfRow | undefined): number | null =>
  row?.find((index): index is number => index !== null) ?? null;

export function usePdfView(pages: readonly PageInfo[]) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState<PdfView>(PdfView.initial);
  const [viewport, setViewport] = useState<PdfViewport>({ width: 0, height: 0 });
  const [shownRow, setShownRow] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!element) return;
    // An observer reports the size it starts with, so the first size needs no read of its own.
    const observer = new ResizeObserver(() =>
      setViewport((before) =>
        before.width === element.clientWidth && before.height === element.clientHeight
          ? before
          : { width: element.clientWidth, height: element.clientHeight },
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  const rows = useMemo(
    () => PdfPageLayout.rows(pages.length, view.display),
    [pages.length, view.display],
  );
  // The pages as drawn: each on its side for an odd turn of Rotate view.
  const turns = view.turns;
  const turned = useMemo(
    () => (turns % 2 === 1 ? pages.map((page) => PdfView.sizeTurned(page, turns)) : pages),
    [pages, turns],
  );
  const extent = useMemo(() => PdfPageLayout.extent(turned), [turned]);
  const scale = PdfPageLayout.scale(view.zoom, extent, view.display.across, viewport);
  const shown = view.display.continuous ? null : Math.min(shownRow, Math.max(0, rows.length - 1));
  const layout = useMemo(
    () => PdfPageLayout.lay({ pages: turned, rows, scale, viewport, shown }),
    [turned, rows, scale, viewport, shown],
  );

  // The scroller's offsets as last set or scrolled to: read before a layout changes, with no read of the page's layout.
  const scroll = useRef<Scroll>({ left: 0, top: 0 });
  const anchor = useRef<Anchor | null>(null);
  // The layout last laid out at a size, and the latest of what the handlers read.
  const laid = useRef<PdfPageLayout | null>(null);
  const latest = useRef({ layout, viewport, rows, shown, page, extent, view });
  useLayoutEffect(() => {
    latest.current = { layout, viewport, rows, shown, page, extent, view };
  });

  // The part of the layout in view, for whoever draws only what shows (a page's tiles): told on every scroll and
  // every layout, read without a render.
  const shownRect = useRef<PdfLayoutRect>({ left: 0, top: 0, width: 0, height: 0 });
  const watchers = useRef(new Set<() => void>());
  const tellView = useCallback(() => {
    const size = latest.current.viewport;
    const { left, top } = scroll.current;
    const now = shownRect.current;
    if (
      now.left === left &&
      now.top === top &&
      now.width === size.width &&
      now.height === size.height
    )
      return;
    shownRect.current = { left, top, width: size.width, height: size.height };
    for (const watcher of watchers.current) watcher();
  }, []);
  const viewStore = useMemo<PdfViewStore>(
    () => ({
      get: () => shownRect.current,
      subscribe: (watcher) => {
        watchers.current.add(watcher);
        return () => watchers.current.delete(watcher);
      },
    }),
    [],
  );

  const readPage = useCallback(() => {
    const { layout: now, viewport: size } = latest.current;
    if (size.width === 0) return;
    const at = PdfPageLayout.pageInView(now, {
      x: scroll.current.left + size.width / 2,
      y: scroll.current.top + size.height / 2,
    });
    if (at !== null) setPage(at);
  }, []);

  // The scroller, as the moves set its offsets; `element` is the same, as state, for the effects that watch it.
  const scroller = useRef<HTMLDivElement | null>(null);
  const scrollTo = useCallback(
    (to: Scroll) => {
      const node = scroller.current;
      if (!node) return;
      node.scrollLeft = to.left;
      node.scrollTop = to.top;
      scroll.current = to;
      tellView();
    },
    [tellView],
  );

  useEffect(() => {
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      scroll.current = { left: element.scrollLeft, top: element.scrollTop };
      tellView();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(readPage);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('scroll', onScroll);
    };
  }, [element, readPage, tellView]);

  // Every commit: a new layout keeps its anchor's place; an anchor whose change laid nothing out again is spent.
  useLayoutEffect(() => {
    const before = laid.current;
    const next = anchor.current;
    anchor.current = null;
    if (before === layout || viewport.width === 0) return;
    laid.current = layout;
    let to: Scroll | null = null;
    if (next?.kind === 'page')
      to = PdfPageLayout.scrollToPlace(
        layout,
        { index: next.index, ...(next.at ?? TOP) },
        viewport,
      );
    else if (next?.kind === 'row-end')
      to = { left: 0, top: Math.max(0, layout.height - viewport.height) };
    else if (before) {
      const focus = next?.focus ?? { x: viewport.width / 2, y: viewport.height / 2 };
      const place = PdfPageLayout.placeAt(before, {
        x: scroll.current.left + focus.x,
        y: scroll.current.top + focus.y,
      });
      if (place) to = PdfPageLayout.scrollTo(layout, place, focus, viewport);
    }
    if (to) scrollTo(to);
    readPage();
    tellView();
  });

  /** The scale a zoom is now. */
  const scaleOf = useCallback((zoom: PdfZoom, across: 1 | 2): number => {
    const { extent: now, viewport: size } = latest.current;
    return PdfPageLayout.scale(zoom, now, across, size);
  }, []);

  /** A zoom from the menus, the keys or the page bar keeps the middle of the view; a wheel's, the pointer's place. */
  const zoomTo = useCallback((zoom: PdfZoom, way: PdfZoomWay, focus?: PdfPoint) => {
    track('Pdf', 'Zoomed', way);
    debugLog(`[pdf] view-zoomed zoom=${zoom} way=${way}`);
    if (focus) anchor.current = { kind: 'focus', focus };
    setView((before) => PdfView.withZoom(before, zoom));
  }, []);

  /** A wheel's or a pinch's zoom, by a factor of the zoom shown, about the pointer; told to telemetry as it settles. */
  const zoomBy = useCallback(
    (factor: number, focus: PdfPoint) => {
      anchor.current = { kind: 'focus', focus };
      setView((before) =>
        PdfView.withZoom(before, scaleOf(before.zoom, before.display.across) * factor),
      );
    },
    [scaleOf],
  );

  /** A row by its index: scrolled to where every row is down the view, else shown alone. */
  // `at`: a place on the row's page `page` to put at the view's top left, rather than the row's first page's top.
  const goToRow = useCallback(
    (row: number, end = false, at?: { page: number; spot: PdfSpot }) => {
      const now = latest.current;
      const first = firstOf(now.rows[row]);
      if (first === null) return;
      const index = at?.page ?? first;
      const spot = at?.spot ?? TOP;
      if (now.shown === null || now.shown === row) {
        const to = end
          ? { left: 0, top: Math.max(0, now.layout.height - now.viewport.height) }
          : PdfPageLayout.scrollToPlace(now.layout, { index, ...spot }, now.viewport);
        if (to) scrollTo(to);
        readPage();
        return;
      }
      anchor.current = end ? { kind: 'row-end' } : { kind: 'page', index, at: spot };
      setShownRow(row);
      setPage(index);
    },
    [scrollTo, readPage],
  );

  /** A page by its index: its top at the view's top, or `at` a place on it; its row shown where one row is. */
  const goToPage = useCallback(
    (index: number, at: PdfSpot = TOP) => {
      const now = latest.current;
      if (index < 0 || index >= pages.length) return;
      debugLog(`[pdf] view-went-to page=${index + 1}`);
      if (now.shown !== null)
        return goToRow(PdfPageLayout.rowOf(now.rows, index), false, { page: index, spot: at });
      const to = PdfPageLayout.scrollToPlace(now.layout, { index, ...at }, now.viewport);
      if (to) scrollTo(to);
      readPage();
    },
    [pages.length, goToRow, scrollTo, readPage],
  );

  /** The row before or after the one in view; a row turned back to from its start shows its end. */
  const turn = useCallback(
    (by: -1 | 1, end = false) => {
      const now = latest.current;
      goToRow(PdfPageLayout.rowOf(now.rows, now.page) + by, end);
    },
    [goToRow],
  );

  /** A page brought into view only where it is out of it (an undo's step, a person followed). */
  const showPage = useCallback(
    (index: number) => {
      const now = latest.current;
      const box = now.layout.boxes.find((candidate) => candidate.index === index);
      const { left, top } = scroll.current;
      const seen =
        box &&
        box.top < top + now.viewport.height &&
        box.top + box.height > top &&
        box.left < left + now.viewport.width &&
        box.left + box.width > left;
      if (!seen) goToPage(index);
    },
    [goToPage],
  );

  /** The place at the view's top left, for Previous view to go back to; null before a page is laid out. */
  const placeInView = useCallback(
    () => PdfPageLayout.placeInView(latest.current.layout, scroll.current),
    [],
  );

  const setDisplay = useCallback(
    (name: PdfPageDisplayName) => {
      const now = latest.current;
      if (PdfView.displayName(now.view.display) === name) return;
      track('Pdf', 'Changed', `PageDisplay.${DISPLAY_TELEMETRY[name]}`);
      debugLog(`[pdf] view-display display=${name}`);
      const next = PdfView.withDisplay(now.view, name);
      anchor.current = { kind: 'page', index: now.page };
      setShownRow(PdfPageLayout.rowOf(PdfPageLayout.rows(pages.length, next.display), now.page));
      setView(next);
    },
    [pages.length],
  );

  const setCover = useCallback(
    (cover: boolean) => {
      const now = latest.current;
      if (now.view.display.cover === cover) return;
      track('Pdf', 'Changed', cover ? 'PageDisplay.CoverShown' : 'PageDisplay.CoverHidden');
      const next = PdfView.withCover(now.view, cover);
      // A cover page changes nothing with one page across.
      if (next.display.across === 2) anchor.current = { kind: 'page', index: now.page };
      setShownRow(PdfPageLayout.rowOf(PdfPageLayout.rows(pages.length, next.display), now.page));
      setView(next);
    },
    [pages.length],
  );

  /** Rotate view: every page a quarter more, for this person only; the page in view stays in view. */
  const rotate = useCallback((by: 1 | -1) => {
    const now = latest.current;
    track('Pdf', 'Changed', by === 1 ? 'RotateView.Clockwise' : 'RotateView.Counterclockwise');
    const next = PdfView.turned(now.view, by);
    debugLog(`[pdf] view-turned turns=${next.turns}`);
    anchor.current = { kind: 'page', index: now.page };
    setView(next);
  }, []);

  const attach = useCallback((node: HTMLDivElement | null) => {
    scroller.current = node;
    setElement(node);
  }, []);
  const rowInView = PdfPageLayout.rowOf(rows, page);

  const count = pages.length;
  const atFirst = rowInView <= 0;
  const atLast = rowInView >= rows.length - 1;
  return useMemo(
    () => ({
      view,
      scale,
      layout,
      viewport,
      /** The page in view, by its index. */
      page,
      count,
      atFirst,
      atLast,
      attach,
      element,
      zoomTo,
      zoomBy,
      goToPage,
      showPage,
      placeInView,
      turn,
      setDisplay,
      setCover,
      rotate,
      viewStore,
    }),
    [
      view,
      scale,
      layout,
      viewport,
      page,
      count,
      atFirst,
      atLast,
      attach,
      element,
      zoomTo,
      zoomBy,
      goToPage,
      showPage,
      placeInView,
      turn,
      setDisplay,
      setCover,
      rotate,
      viewStore,
    ],
  );
}

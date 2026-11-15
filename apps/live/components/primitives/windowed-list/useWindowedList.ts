'use client';

// A long list that draws only the rows near the view (docs/specs/013-workspace/explorer-structure.md "Long lists").
// The list is as tall as all its rows from the first draw: rows not drawn are room of their height (a gap element),
// so the scrollbar is the whole list's and nothing jumps. Rows are uniform; the hook measures them from the rows it
// draws, follows the scroller (the window, or the nearest scrolling pane), keeps the focused or dragged row drawn,
// tells screen readers each row's place, and keeps the list's place for Back.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FocusEvent,
} from 'react';
import { debugLog } from '@/lib/debug-log';
import { placeAt, restoreOffset, type PlaceGeometry, type PlaceStore } from './list-places';
import {
  LIST_WINDOW_FROM,
  drawnRowRange,
  windowSegments,
  type RowRange,
  type WindowSegment,
} from './window-range';

/** How long a first draw's cascade takes to settle; rows drawn after it appear at once. */
export const CASCADE_SETTLE_MS = 450;
/** How long the scroll rests before a list's place is written down. */
const PLACE_WRITE_MS = 150;

export type WindowedListOptions = {
  /** Every entry's stable key (folders first, then documents), in the order drawn. */
  keys: readonly string[];
  /** How many leading entries (a view's folders) are always drawn. */
  leading?: number;
  /** A row's height before one is measured, gap included. */
  estimateStride: number;
  /** The scrolling ancestor of the list; null (the default) is the window. */
  scroller?: (list: HTMLElement) => HTMLElement | null;
  /** A CSS grid: rows hold as many entries as it has columns. */
  grid?: boolean;
  /** Each drawn row's place for a screen reader: a list's `aria-posinset`, a table's `aria-rowindex`. */
  aria?: { kind: 'list' } | { kind: 'table'; rowOffset: number };
  /** Where the list's place is kept, and whether to go back to it now (Back, or the panel drawn again). */
  place?: { key: string; store: PlaceStore; restore: boolean } | null;
  /** A new scope (another folder, view or sort): the cascade plays again and the pin is let go. */
  resetKey?: string;
};

export type WindowedList = {
  /** The element whose children are the rows (and the gaps). */
  listRef: (el: HTMLElement | null) => void;
  segments: WindowSegment[];
  /** True while the first draw's cascade plays: the host adds its cascade class only then. */
  cascading: boolean;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
};

type Metrics = { stride: number; gap: number; lanes: number; origin: number };
/** What the drawing depends on: the rows to draw and the measures the room is made of. */
type Drawing = { range: RowRange; stride: number; gap: number; lanes: number };

/** A measure moving by less than this is the same: sub-pixel layout never redraws the list. */
const MEASURE_TOLERANCE_PX = 0.5;
/** The list's drawn rows, its gaps left out. */
const rowsOf = (list: HTMLElement) =>
  [...list.children].filter(
    (c) => (c as HTMLElement).dataset.windowGap === undefined,
  ) as HTMLElement[];

const sameDrawing = (a: Drawing, b: Drawing) =>
  a.range.first === b.range.first &&
  a.range.last === b.range.last &&
  a.lanes === b.lanes &&
  Math.abs(a.stride - b.stride) < MEASURE_TOLERANCE_PX &&
  Math.abs(a.gap - b.gap) < MEASURE_TOLERANCE_PX;

export function useWindowedList({
  keys,
  leading = 0,
  estimateStride,
  scroller,
  grid = false,
  aria,
  place,
  resetKey = '',
}: WindowedListOptions): WindowedList {
  const count = keys.length;
  const [list, setList] = useState<HTMLElement | null>(null);
  const metrics = useRef<Metrics>({ stride: estimateStride, gap: 0, lanes: 1, origin: 0 });
  const [drawing, setDrawing] = useState<Drawing>(() => ({
    range: {
      first: 0,
      last: Math.ceil(
        (typeof window === 'undefined' ? 1000 : window.innerHeight + 800) / estimateStride,
      ),
    },
    stride: estimateStride,
    gap: 0,
    lanes: 1,
  }));
  const follow = useCallback((next: Drawing | null) => {
    if (next) setDrawing((d) => (sameDrawing(d, next) ? d : next));
  }, []);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [cascading, setCascading] = useState(true);
  const indexByKey = useMemo(() => new Map(keys.map((k, i) => [k, i])), [keys]);
  const pinned = pinnedKey === null ? null : (indexByKey.get(pinnedKey) ?? null);
  const windowed = count > LIST_WINDOW_FROM;

  const segments = useMemo(
    () =>
      windowSegments({
        count,
        lanes: drawing.lanes,
        leading,
        pinned,
        range: drawing.range,
        stride: drawing.stride,
        gap: drawing.gap,
      }),
    [count, leading, pinned, drawing],
  );
  // Which entry each drawn child (gaps skipped) shows, in order.
  const drawn = useMemo(() => {
    const out: number[] = [];
    for (const s of segments)
      if (s.kind === 'items') for (let i = s.from; i < s.to; i += 1) out.push(i);
    return out;
  }, [segments]);
  const drawnRef = useRef(drawn);
  drawnRef.current = drawn;

  // A new scope: the cascade plays again, the pin goes, and the window starts at the top.
  const [scope, setScope] = useState(resetKey);
  if (scope !== resetKey) {
    setScope(resetKey);
    setCascading(true);
    setPinnedKey(null);
  }
  useEffect(() => {
    if (!cascading) return;
    const timer = window.setTimeout(() => setCascading(false), CASCADE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [cascading]);

  const scrollerOf = useCallback((el: HTMLElement) => scroller?.(el) ?? null, [scroller]);

  // Measures the rows drawn and the view, and answers the rows to draw.
  const measure = useCallback((): Drawing | null => {
    if (!list) return null;
    const box = scrollerOf(list);
    const boxTop = box ? box.getBoundingClientRect().top - box.scrollTop : -window.scrollY;
    const topOf = (el: Element) => el.getBoundingClientRect().top - boxTop;
    const children = rowsOf(list);
    const order = drawnRef.current;
    const m = metrics.current;
    if (grid) {
      const columns = getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length;
      m.lanes = Math.max(1, columns);
    }
    const firstFree = Math.ceil(leading / m.lanes) * m.lanes;
    const at = new Map<number, HTMLElement>();
    children.forEach((c, i) => {
      const index = order[i];
      if (index !== undefined) at.set(index, c);
    });
    // Two rows a lane apart, past the folders, give the stride; the rows from the far end of the range are the
    // most uniform.
    let a: number | null = null;
    for (const index of order) if (index >= firstFree && at.has(index + m.lanes)) a = index;
    if (a !== null) {
      const top = topOf(at.get(a)!);
      const stride = topOf(at.get(a + m.lanes)!) - top;
      if (stride > 0) {
        m.stride = stride;
        m.gap = Math.max(0, stride - at.get(a)!.offsetHeight);
        m.origin = top - Math.floor(a / m.lanes) * stride;
      }
    } else {
      const first = order.find((i) => i >= firstFree);
      if (first !== undefined && at.has(first))
        m.origin = topOf(at.get(first)!) - Math.floor(first / m.lanes) * m.stride;
    }
    const view = box
      ? { top: box.scrollTop, bottom: box.scrollTop + box.clientHeight }
      : { top: window.scrollY, bottom: window.scrollY + window.innerHeight };
    lastView.current = view;
    const range = drawnRowRange({
      rows: Math.ceil(count / m.lanes),
      stride: m.stride,
      origin: m.origin,
      view,
    });
    return { range, stride: m.stride, gap: m.gap, lanes: m.lanes };
  }, [list, scrollerOf, grid, leading, count]);
  const lastView = useRef({ top: 0, bottom: 0 });

  // Screen readers: each drawn row's place in the whole list.
  useLayoutEffect(() => {
    if (!list || !aria) return;
    const children = rowsOf(list);
    children.forEach((c, i) => {
      const index = drawn[i];
      if (index === undefined) return;
      if (aria.kind === 'list') {
        c.setAttribute('aria-setsize', String(count));
        c.setAttribute('aria-posinset', String(index + 1));
      } else c.setAttribute('aria-rowindex', String(index + 1 + aria.rowOffset));
    });
  });

  // The place kept for Back: taken back once, the first time there is a list to place.
  const restorePending = useRef(place?.restore ?? false);
  const placeRef = useRef(place);
  placeRef.current = place;
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const geometry = useCallback((): PlaceGeometry => {
    const m = metrics.current;
    return { rows: Math.ceil(count / m.lanes), stride: m.stride, origin: m.origin, lanes: m.lanes };
  }, [count]);

  // After every draw: measure, follow the view, and take a kept place back.
  useLayoutEffect(() => {
    if (!list || count === 0) return;
    const next = measure();
    const p = placeRef.current;
    if (restorePending.current && p) {
      restorePending.current = false;
      const kept = p.store.read(p.key);
      if (kept) {
        const target = restoreOffset({
          place: kept,
          geometry: geometry(),
          indexOf: (k) => indexByKey.get(k) ?? -1,
        });
        const box = scrollerOf(list);
        if (box) box.scrollTop = target;
        else window.scrollTo(0, target);
        debugLog(
          `[list-place] restored key=${p.key} anchor=${kept.anchorId ?? 'none'} top=${Math.round(target)}`,
        );
        follow(measure());
        return;
      }
      debugLog(`[list-place] none-kept key=${p.key}`);
    }
    if (windowed) follow(next);
  });

  // Follow the scroller and the window's size; write the place down when the scroll rests.
  useEffect(() => {
    if (!list || count === 0) return;
    const box = scrollerOf(list);
    const target: HTMLElement | Window = box ?? window;
    let frame = 0;
    let writeTimer = 0;
    let pendingPlace: (() => void) | null = null;
    const writePlace = () => {
      pendingPlace?.();
      pendingPlace = null;
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = measure();
        if (windowed) follow(next);
        const p = placeRef.current;
        if (p && !restorePending.current) {
          const at = placeAt({
            viewTop: lastView.current.top,
            geometry: geometry(),
            idOf: (i) => keysRef.current[i],
          });
          pendingPlace = () => p.store.write(p.key, at);
          window.clearTimeout(writeTimer);
          writeTimer = window.setTimeout(writePlace, PLACE_WRITE_MS);
        }
      });
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onScroll);
    resize?.observe(list);
    return () => {
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      resize?.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(writeTimer);
      writePlace();
    };
  }, [list, count, windowed, measure, scrollerOf, geometry, follow]);

  const pinFrom = useCallback(
    (target: EventTarget | null) => {
      if (!list || !(target instanceof Node)) return;
      let node: Node | null = target;
      while (node && node.parentNode !== list) node = node.parentNode;
      if (!node) return;
      const children = rowsOf(list);
      const index = drawnRef.current[children.indexOf(node as Element)];
      const key = index === undefined ? undefined : keysRef.current[index];
      if (key !== undefined) setPinnedKey((k) => (k === key ? k : key));
    },
    [list],
  );

  return {
    listRef: setList,
    segments,
    cascading,
    onFocus: (e) => pinFrom(e.target),
    onDragStart: (e) => pinFrom(e.target),
  };
}

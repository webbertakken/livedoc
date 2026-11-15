'use client';

// A long list that draws only the rows near the view (docs/specs/013-workspace/explorer-structure.md "Long lists").
// The list is as tall as all its rows from the first draw: rows not drawn are room of their height (a gap element),
// so the scrollbar is the whole list's and nothing jumps. Rows are uniform; the hook measures them from the rows it
// draws, follows the scroller (the window, or the box the list scrolls in), keeps the focused or dragged row drawn,
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
import {
  placeAt,
  restoreOffset,
  type ListPlace,
  type PlaceGeometry,
  type PlaceStore,
} from './list-places';
import {
  LIST_ROWS_PER_FRAME,
  LIST_WINDOW_FROM,
  drawnRowRange,
  stepTowards,
  windowSegments,
  type RowRange,
  type WindowSegment,
} from './window-range';

/** How long a first draw's cascade takes to settle (150 ms rise after at most 100 ms delay, and a margin). */
export const CASCADE_SETTLE_MS = 450;
/** How long the scroll rests before a list's place is written down. */
const PLACE_WRITE_MS = 150;
/** How long a place taken back is held while the rows and what sits above them settle. */
const PLACE_HOLD_MS = 1500;
/** A measure moving by less than this is the same: sub-pixel layout never redraws the list. */
const MEASURE_TOLERANCE_PX = 0.5;

export type ListPlaceOption = { key: string; store: PlaceStore; restore: boolean } | null;

export type WindowedListOptions = {
  /** Every entry's stable key (folders first, then documents), in the order drawn. */
  keys: readonly string[];
  /** How many leading entries (a view's folders) are always drawn. */
  leading?: number;
  /** A row's height before one is measured, gap included. */
  estimateStride: number;
  /** The box the list scrolls in; null (the default) is the window. */
  scroller?: (list: HTMLElement) => HTMLElement | null;
  /** A CSS grid: rows hold as many entries as it has columns. */
  grid?: boolean;
  /** Each drawn row's place for a screen reader: a list's `aria-posinset`, a table's `aria-rowindex`. */
  aria?: { kind: 'list' } | { kind: 'table'; rowOffset: number };
  /** Where the list's place is kept, and whether to go back to it now (Back, or the panel drawn again). */
  place?: ListPlaceOption;
  /** A new scope (another folder or view): the cascade plays again and the pin is let go. */
  resetKey?: string;
};

export type WindowedList = {
  /** Attach to the element whose children are the rows (and the gaps). */
  attachList: (el: HTMLElement | null) => void;
  segments: WindowSegment[];
  /** True while the first draw's cascade plays: the host adds its cascade class only then. */
  cascading: boolean;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
};

type Metrics = { stride: number; gap: number; lanes: number; origin: number };
/** What the drawing depends on: the rows to draw and the measures the room is made of. */
type Drawing = { range: RowRange; stride: number; gap: number; lanes: number };

const sameDrawing = (a: Drawing, b: Drawing) =>
  a.range.first === b.range.first &&
  a.range.last === b.range.last &&
  a.lanes === b.lanes &&
  Math.abs(a.stride - b.stride) < MEASURE_TOLERANCE_PX &&
  Math.abs(a.gap - b.gap) < MEASURE_TOLERANCE_PX;

/** The list's drawn rows, its gaps left out. */
const rowsOf = (list: HTMLElement) =>
  [...list.children].filter(
    (c) => (c as HTMLElement).dataset.windowGap === undefined,
  ) as HTMLElement[];

const drawnIndices = (segments: readonly WindowSegment[]) => {
  const out: number[] = [];
  for (const s of segments)
    if (s.kind === 'items') for (let i = s.from; i < s.to; i += 1) out.push(i);
  return out;
};

// The first draw: the top of the list, a frame's share and a half (the cascade hides the rows that follow it in).
function firstDrawing(estimateStride: number): Drawing {
  const view = typeof window === 'undefined' ? 1000 : window.innerHeight;
  return {
    range: {
      first: 0,
      last: Math.min(Math.ceil(view / estimateStride), Math.ceil(LIST_ROWS_PER_FRAME * 1.5)),
    },
    stride: estimateStride,
    gap: 0,
    lanes: 1,
  };
}

export function useWindowedList({
  keys,
  leading = 0,
  estimateStride,
  scroller,
  grid = false,
  aria,
  place = null,
  resetKey = '',
}: WindowedListOptions): WindowedList {
  const count = keys.length;
  const [list, setList] = useState<HTMLElement | null>(null);
  const [drawing, setDrawing] = useState<Drawing>(() => firstDrawing(estimateStride));
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [cascading, setCascading] = useState(true);
  const indexByKey = useMemo(() => new Map(keys.map((k, i) => [k, i])), [keys]);
  const pinned = pinnedKey === null ? null : (indexByKey.get(pinnedKey) ?? null);

  // A new scope: the cascade plays again and the pin goes.
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

  const segments = useMemo(
    () =>
      windowSegments({
        count,
        leading,
        pinned,
        lanes: drawing.lanes,
        range: drawing.range,
        stride: drawing.stride,
        gap: drawing.gap,
      }),
    [count, leading, pinned, drawing],
  );

  // What the frame callbacks read: the latest render's, synced after it commits.
  const latest = useRef({
    segments,
    keys,
    indexByKey,
    place,
    leading,
    grid,
    scroller,
    count,
    drawing,
  });
  const metrics = useRef<Metrics>({ stride: estimateStride, gap: 0, lanes: 1, origin: 0 });
  const restorePending = useRef(place?.restore ?? false);
  const holding = useRef<{ place: ListPlace; until: number } | null>(null);
  // Another list in the same element (Back from one folder to another): its place may go back too.
  const placeShown = useRef(place?.key ?? null);
  const schedule = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    if ((place?.key ?? null) !== placeShown.current) {
      placeShown.current = place?.key ?? null;
      restorePending.current = place?.restore ?? false;
    }
    latest.current = { segments, keys, indexByKey, place, leading, grid, scroller, count, drawing };
  });

  // Screen readers: each drawn row's place in the whole list.
  useLayoutEffect(() => {
    if (!list || !aria) return;
    const drawn = drawnIndices(segments);
    rowsOf(list).forEach((row, i) => {
      const index = drawn[i];
      if (index === undefined) return;
      if (aria.kind === 'list') {
        row.setAttribute('aria-setsize', String(count));
        row.setAttribute('aria-posinset', String(index + 1));
      } else row.setAttribute('aria-rowindex', String(index + 1 + aria.rowOffset));
    });
  });

  // A kept place goes back before the first paint: the scroll moves at once, the rows there follow next frame.
  useLayoutEffect(() => {
    const p = latest.current.place;
    if (!list || count === 0 || !restorePending.current || !p) return;
    restorePending.current = false;
    const kept = p.store.read(p.key);
    if (!kept) {
      debugLog(`[list-place] none-kept key=${p.key}`);
      return;
    }
    const box = latest.current.scroller?.(list) ?? null;
    measureInto(list, box, metrics.current, latest.current);
    const target = restoreOffset({
      place: kept,
      geometry: geometryOf(metrics.current, count),
      indexOf: (k) => indexByKey.get(k) ?? -1,
    });
    if (box) box.scrollTop = target;
    else window.scrollTo(0, target);
    // The rows and what sits above them may still settle (a header, measures): hold the anchor until they do.
    holding.current = { place: kept, until: performance.now() + PLACE_HOLD_MS };
    debugLog(
      `[list-place] restored key=${p.key} anchor=${kept.anchorId ?? 'none'} top=${Math.round(target)}`,
    );
  }, [list, count, indexByKey, place?.key]);

  // Follow the scroller and the window's size, a frame at a time; write the place down when the scroll rests.
  useEffect(() => {
    if (!list || count === 0) return;
    const box = scroller?.(list) ?? null;
    const target: HTMLElement | Window = box ?? window;
    let frame = 0;
    let writeTimer = 0;
    let pendingWrite: (() => void) | null = null;
    const flushWrite = () => {
      pendingWrite?.();
      pendingWrite = null;
    };
    const sync = () => {
      frame = 0;
      const now = latest.current;
      let view = measureInto(list, box, metrics.current, now);
      const m = metrics.current;
      const held = holding.current;
      if (held && performance.now() < held.until) {
        const want = restoreOffset({
          place: held.place,
          geometry: geometryOf(m, now.count),
          indexOf: (k) => now.indexByKey.get(k) ?? -1,
        });
        if (Math.abs(want - view.top) > 1) {
          if (box) box.scrollTop = want;
          else window.scrollTo(0, want);
          view = measureInto(list, box, m, now);
        }
        // Look again next frame for as long as the place is held.
        window.setTimeout(request, 0);
      } else holding.current = null;
      const geometry = {
        rows: Math.ceil(now.count / m.lanes),
        stride: m.stride,
        origin: m.origin,
        view,
      };
      if (now.count > LIST_WINDOW_FROM) {
        // A frame's share of new rows at most, those in view first; the next frame carries on.
        const range = stepTowards(
          now.drawing.range,
          drawnRowRange(geometry),
          drawnRowRange({ ...geometry, overscanPx: 0, blockRows: 1 }),
          Math.max(1, Math.floor(LIST_ROWS_PER_FRAME / m.lanes)),
        );
        const next: Drawing = { range, stride: m.stride, gap: m.gap, lanes: m.lanes };
        setDrawing((d) => (sameDrawing(d, next) ? d : next));
      }
      const p = now.place;
      if (p && !restorePending.current) {
        const at = placeAt({
          viewTop: view.top,
          geometry: geometryOf(m, now.count),
          idOf: (i) => now.keys[i],
        });
        pendingWrite = () => p.store.write(p.key, at);
        window.clearTimeout(writeTimer);
        writeTimer = window.setTimeout(flushWrite, PLACE_WRITE_MS);
      }
    };
    let live = true;
    const request = () => {
      if (live && !frame) frame = window.requestAnimationFrame(sync);
    };
    schedule.current = request;
    // A person scrolling takes over from a held place at once.
    const letGo = () => {
      holding.current = null;
    };
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const)
      window.addEventListener(type, letGo, { passive: true, capture: true });
    target.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(request);
    resize?.observe(list);
    request();
    return () => {
      live = false;
      schedule.current = () => {};
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const)
        window.removeEventListener(type, letGo, { capture: true });
      target.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      resize?.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(writeTimer);
      flushWrite();
    };
  }, [list, count, scroller]);

  // After every draw the rows may have moved (a new block, a measure): look again next frame.
  useEffect(() => {
    schedule.current();
  });

  const pinFrom = useCallback(
    (target: EventTarget | null) => {
      if (!list || !(target instanceof Node)) return;
      let node: Node | null = target;
      while (node && node.parentNode !== list) node = node.parentNode;
      if (!node) return;
      const index = drawnIndices(latest.current.segments)[
        rowsOf(list).indexOf(node as HTMLElement)
      ];
      const key = index === undefined ? undefined : latest.current.keys[index];
      if (key !== undefined) setPinnedKey((k) => (k === key ? k : key));
    },
    [list],
  );

  return {
    attachList: setList,
    segments,
    cascading,
    onFocus: (e) => pinFrom(e.target),
    onDragStart: (e) => pinFrom(e.target),
  };
}

function geometryOf(m: Metrics, count: number): PlaceGeometry {
  return { rows: Math.ceil(count / m.lanes), stride: m.stride, origin: m.origin, lanes: m.lanes };
}

/**
 * Measures the drawn rows into `m` (stride, gap, lanes, origin, in the scroller's content) and answers the view. Two
 * rows a lane apart, past the folders, give the stride; the pair furthest down the window is taken, as the rows there
 * are the most uniform. With no such pair the stride stays as it was and only the origin is measured.
 */
function measureInto(
  list: HTMLElement,
  box: HTMLElement | null,
  m: Metrics,
  {
    segments,
    leading,
    grid,
  }: { segments: readonly WindowSegment[]; leading: number; grid: boolean },
): { top: number; bottom: number } {
  const boxTop = box ? box.getBoundingClientRect().top - box.scrollTop : -window.scrollY;
  const topOf = (el: Element) => el.getBoundingClientRect().top - boxTop;
  if (grid)
    m.lanes = Math.max(
      1,
      getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length,
    );
  const order = drawnIndices(segments);
  const at = new Map<number, HTMLElement>();
  rowsOf(list).forEach((row, i) => {
    const index = order[i];
    if (index !== undefined) at.set(index, row);
  });
  const firstFree = Math.ceil(leading / m.lanes) * m.lanes;
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
    const first = order.find((i) => i >= firstFree && at.has(i));
    if (first !== undefined)
      m.origin = topOf(at.get(first)!) - Math.floor(first / m.lanes) * m.stride;
  }
  return box
    ? { top: box.scrollTop, bottom: box.scrollTop + box.clientHeight }
    : { top: window.scrollY, bottom: window.scrollY + window.innerHeight };
}

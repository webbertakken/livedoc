'use client';

// Find on a PDF document's surface (docs/specs/035-pdf-documents/reading-surface.md "Find"): the field's query and
// options, a search once the query rests, stopped by a newer one, its results told page by page, the current one, and
// going to it, a jump Previous view comes back from. One person's, never stored.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  PDF_FIND_SETTLE_MS,
  type LinkTarget,
  type PageInfo,
  type PageTurns,
  type PdfEngine,
  type Quad,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  searchPdf,
  type PdfFindOptions,
  type PdfFindProgress,
  type PdfFindResult,
} from './pdf-find';
import { placeOnPage } from './pdf-link';
import { FIND } from './pdf-menus';
import { FIND_NEXT, FIND_PREVIOUS } from './pdf-shortcuts';
import { PdfView } from './pdf-view';
import type { PdfSpot } from './usePdfView';

export const PDF_FIND_OPTIONS_OFF: PdfFindOptions = {
  matchCase: false,
  wholeWords: false,
  marks: false,
  bookmarks: false,
};

/** The tints of one page: every result on it, and the current one. */
export type PdfFindTints = { readonly found: readonly Quad[]; readonly current: readonly Quad[] };

/** What the count says (reading-surface.md "Find"). */
export function pdfFindCount(
  progress: PdfFindProgress | null,
  current: number | null,
  pages: number,
): string {
  if (!progress) return '';
  if (progress.searched < pages)
    return `Searching ${progress.searched.toLocaleString('en-GB')} of ${pages.toLocaleString('en-GB')} pages…`;
  if (progress.total === 0) return 'No results';
  const total =
    progress.total > progress.results.length
      ? `${progress.results.length.toLocaleString('en-GB')}+`
      : progress.total.toLocaleString('en-GB');
  return `${(current ?? 0) + 1} of ${total}`;
}

export function usePdfFind({
  engine,
  pages,
  turns,
  jump,
  follow,
}: {
  engine: Pick<PdfEngine, 'pageText' | 'fileMarks' | 'outline' | 'pageMatrix'> | null;
  pages: readonly PageInfo[];
  turns: PageTurns;
  // Goes to a place on a page, keeping where the view was (usePdfViewHistory.ts).
  jump: (index: number, at?: PdfSpot) => void;
  // Follows a bookmark found, as the outline does.
  follow: (target: LinkTarget | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // Changes each time the field is asked for: focus goes to it.
  const [focusNonce, setFocusNonce] = useState(0);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState(PDF_FIND_OPTIONS_OFF);
  const [progress, setProgress] = useState<PdfFindProgress | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  // The search under way: an older one stops at its next page.
  const searching = useRef(0);

  const goTo = useCallback(
    (result: PdfFindResult) => {
      if (result.kind === 'bookmark') return follow(result.target);
      const page = pages[result.page];
      const first = result.quads[0];
      if (!engine || !page || !first) return jump(result.page);
      // Two of the match's lines above it: the match sits two lines below the view's top.
      const lines = Math.abs(first[1] - first[5]);
      void engine.pageMatrix(result.page, turns).then((matrix) => {
        const y = first[1] + 2 * lines;
        jump(
          result.page,
          matrix ? placeOnPage(matrix, PdfView.sizeTurned(page, turns), { x: null, y }) : undefined,
        );
      });
    },
    [engine, pages, turns, jump, follow],
  );

  // Read as a search tells its first result: a change of view or turn never starts the search again.
  const goToLatest = useRef(goTo);
  useLayoutEffect(() => {
    goToLatest.current = goTo;
  });

  useEffect(() => {
    const token = (searching.current += 1);
    if (!open || !engine || query.trim().length === 0) return;
    const timer = setTimeout(() => {
      track('Pdf', 'Searched', 'Find');
      let first = true;
      void searchPdf({ ...engine, pages: pages.length }, query, options, {
        stopped: () => searching.current !== token,
        onProgress: (now) => {
          setProgress(now);
          if (first && now.results.length > 0) {
            first = false;
            setCurrent(0);
            goToLatest.current(now.results[0]!);
          }
          if (now.searched === pages.length)
            debugLog(`[pdf] find-searched pages=${now.searched} results=${now.total}`);
        },
      });
    }, PDF_FIND_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [open, engine, pages.length, query, options]);

  const listed = useMemo(() => progress?.results ?? [], [progress]);
  const step = useCallback(
    (by: 1 | -1) => {
      if (listed.length === 0) return;
      const next = current === null ? (by === 1 ? 0 : listed.length - 1) : current + by;
      const at = (next + listed.length) % listed.length;
      setCurrent(at);
      goTo(listed[at]!);
    },
    [listed, current, goTo],
  );

  const choose = useCallback(
    (at: number) => {
      const result = listed[at];
      if (!result) return;
      setCurrent(at);
      goTo(result);
    },
    [listed, goTo],
  );

  const ask = useCallback((next: string) => {
    setQuery(next);
    setProgress(null);
    setCurrent(null);
  }, []);
  const setOption = useCallback((name: keyof PdfFindOptions, on: boolean) => {
    setOptions((before) => ({ ...before, [name]: on }));
    setProgress(null);
    setCurrent(null);
  }, []);

  const close = useCallback(() => {
    searching.current += 1;
    setOpen(false);
    setListOpen(false);
    setProgress(null);
    setCurrent(null);
  }, []);

  const actions = useMemo<OfficeActions>(
    () => ({
      [FIND]: {
        run: () => {
          setOpen(true);
          setFocusNonce((n) => n + 1);
        },
      },
      ...(open && listed.length > 0
        ? { [FIND_NEXT]: { run: () => step(1) }, [FIND_PREVIOUS]: { run: () => step(-1) } }
        : {}),
    }),
    [open, listed.length, step],
  );

  // Every result on a page tinted, the current one stronger (reading-surface.md "Find").
  const tints = useMemo((): ReadonlyMap<number, PdfFindTints> => {
    const byPage = new Map<number, { found: Quad[]; current: Quad[] }>();
    listed.forEach((result, at) => {
      if (result.kind === 'bookmark') return;
      const tint = byPage.get(result.page) ?? { found: [], current: [] };
      (at === current ? tint.current : tint.found).push(...result.quads);
      byPage.set(result.page, tint);
    });
    return byPage;
  }, [listed, current]);

  return {
    open,
    focusNonce,
    query,
    options,
    progress,
    current,
    listOpen,
    tints,
    count: pdfFindCount(progress, current, pages.length),
    actions,
    ask,
    setOption,
    step,
    choose,
    close,
    setListOpen,
  };
}

export type PdfFind = ReturnType<typeof usePdfFind>;

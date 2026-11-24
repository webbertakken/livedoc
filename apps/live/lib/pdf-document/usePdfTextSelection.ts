'use client';

// A person's text selection on a PDF's pages (docs/specs/035-pdf-documents/reading-surface.md "The pages": Selecting
// text, Copy): the gestures a page hands over, turned into spans of one page's text, the rectangles they are drawn
// with and the text they copy. One person's, never shared, cleared when the pages change.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TextRange,
  type PageInfo,
  type PagePoint,
  type PageText,
  type PdfEngine,
  type Quad,
  type TextSpan,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { pdfPageTexts, type PdfPageTexts } from './pdf-page-texts';

/** What a page hands over while Select is in hand, its points in page space. */
export type PdfTextGesture =
  /** A press: Shift extends the selection on its page, Alt starts a column. */
  | { kind: 'press'; at: PagePoint; shift: boolean; alt: boolean }
  /** The pointer moved while pressed. */
  | { kind: 'drag'; at: PagePoint }
  /** Presses in a row: two select a word, three a line. */
  | { kind: 'presses'; at: PagePoint; count: number }
  /** A finger held still: the word under it, as two presses select, with handles and a bar ("Phone and tablet"). */
  | { kind: 'long-press'; at: PagePoint }
  /** A handle of a finger's selection dragged: that end to the caret place under the finger, the other staying. */
  | { kind: 'handle'; end: 'start' | 'end'; at: PagePoint };

export type PdfTextSelected = {
  page: number;
  spans: readonly TextSpan[];
  quads: readonly Quad[];
  /** The plain text it copies. */
  text: string;
  /** A finger made it: it has handles and a bar. */
  touch: boolean;
};

// Where a drag started: a caret place (the end a handle's drag holds still, for that handle), or a column's corner.
type Start =
  { page: number; anchor: number; handle?: 'start' | 'end' } | { page: number; corner: PagePoint };

const NO_SPANS: readonly TextSpan[] = [];

export function usePdfTextSelection(
  engine: Pick<PdfEngine, 'pageText' | 'pageTags'> | null,
  pages: readonly PageInfo[] | null,
) {
  // A change of the pages reads them anew and clears what was selected on the old ones.
  const texts = useMemo(() => (engine && pages ? pdfPageTexts(engine) : null), [engine, pages]);
  // What is selected, on the pages it was selected on: on other pages nothing is.
  const [held, setHeld] = useState<{ on: PdfPageTexts | null; selected: PdfTextSelected | null }>({
    on: null,
    selected: null,
  });
  const selected = held.on === texts ? held.selected : null;
  const setSelected = useCallback(
    (next: PdfTextSelected | null) => setHeld({ on: texts, selected: next }),
    [texts],
  );
  const start = useRef<Start | null>(null);
  const current = useRef(texts);
  useEffect(() => {
    current.current = texts;
    start.current = null;
  }, [texts]);

  // Runs `pick` on the page's text once it is read, unless the pages changed meanwhile.
  const onText = useCallback(
    (page: number, pick: (text: PageText) => void) => {
      if (!texts) return;
      void texts.read(page).then((text) => {
        if (text && current.current === texts) pick(text);
      });
    },
    [texts],
  );

  // The spans last shown, on their page: where a handle's drag reaches from.
  const shown = useRef<{ page: number; spans: readonly TextSpan[] } | null>(null);
  const show = useCallback(
    (page: number, text: PageText, spans: readonly TextSpan[], touch = false) => {
      const kept = spans.filter(([from, to]) => to > from);
      shown.current = kept.length === 0 ? null : { page, spans: kept };
      setSelected(
        kept.length === 0
          ? null
          : {
              page,
              spans: kept,
              quads: TextRange.quads(text, kept),
              text: TextRange.copied(text, kept),
              touch,
            },
      );
    },
    [setSelected],
  );

  const gesture = useCallback(
    (page: number, done: PdfTextGesture) => {
      if (done.kind === 'presses') {
        if (done.count < 2) return;
        return onText(page, (text) => {
          const nearest = TextRange.nearest(text, done.at);
          if (nearest === null) return;
          const span =
            done.count === 2 ? TextRange.word(text, nearest) : TextRange.line(text, nearest);
          start.current = { page, anchor: span[0] };
          show(page, text, [span]);
        });
      }
      if (done.kind === 'long-press') {
        return onText(page, (text) => {
          const nearest = TextRange.nearest(text, done.at);
          debugLog(
            `[pdf] text-long-pressed page=${page + 1} selected=${nearest === null ? 'no' : 'yes'}`,
          );
          if (nearest === null) return;
          const span = TextRange.word(text, nearest);
          start.current = { page, anchor: span[0] };
          show(page, text, [span], true);
        });
      }
      if (done.kind === 'handle') {
        const was = shown.current;
        if (was?.page !== page) return;
        // The end held still is read once a drag: the handles may cross as it goes.
        const begun = start.current;
        const anchor =
          begun && 'anchor' in begun && begun.page === page && begun.handle === done.end
            ? begun.anchor
            : done.end === 'end'
              ? was.spans[0]![0]
              : was.spans.at(-1)![1];
        start.current = { page, anchor, handle: done.end };
        return onText(page, (text) => {
          const caret = TextRange.caretAt(text, done.at);
          // A handle dragged onto the other end leaves the selection as it was, its handles with it.
          if (caret === null || caret === anchor) return;
          show(page, text, [TextRange.between(anchor, caret)], true);
        });
      }
      let begun = start.current;
      if (done.kind === 'press') {
        if (done.alt) begun = { page, corner: done.at };
        else if (!(done.shift && begun?.page === page && 'anchor' in begun))
          begun = { page, anchor: -1 };
        start.current = begun;
      }
      // A drag with no press on this page before it.
      if (begun?.page !== page) return;
      const from = begun;
      onText(page, (text) => {
        if ('corner' in from) return show(page, text, TextRange.column(text, from.corner, done.at));
        const caret = TextRange.caretAt(text, done.at);
        if (caret === null) return show(page, text, NO_SPANS);
        // A press that starts a drag places its start; one with Shift, and a drag, reach from it.
        if (from.anchor < 0) from.anchor = caret;
        show(page, text, [TextRange.between(from.anchor, caret)]);
      });
    },
    [onText, show],
  );

  const selectAll = useCallback(
    (page: number) => {
      start.current = { page, anchor: 0 };
      onText(page, (text) => show(page, text, [TextRange.all(text)]));
    },
    [onText, show],
  );

  const clear = useCallback(() => {
    start.current = null;
    shown.current = null;
    setSelected(null);
  }, [setSelected]);

  return { selected, gesture, selectAll, clear, texts };
}

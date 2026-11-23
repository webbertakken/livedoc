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
import { pdfPageTexts, type PdfPageTexts } from './pdf-page-texts';

/** What a page hands over while Select is in hand, its points in page space. */
export type PdfTextGesture =
  /** A press: Shift extends the selection on its page, Alt starts a column. */
  | { kind: 'press'; at: PagePoint; shift: boolean; alt: boolean }
  /** The pointer moved while pressed. */
  | { kind: 'drag'; at: PagePoint }
  /** Presses in a row: two select a word, three a line. */
  | { kind: 'presses'; at: PagePoint; count: number };

export type PdfTextSelected = {
  page: number;
  spans: readonly TextSpan[];
  quads: readonly Quad[];
  /** The plain text it copies. */
  text: string;
};

// Where a drag started: a caret place, or a column's first corner.
type Start = { page: number; anchor: number } | { page: number; corner: PagePoint };

const NO_SPANS: readonly TextSpan[] = [];

export function usePdfTextSelection(
  engine: Pick<PdfEngine, 'pageText'> | null,
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

  const show = useCallback(
    (page: number, text: PageText, spans: readonly TextSpan[]) => {
      const kept = spans.filter(([from, to]) => to > from);
      setSelected(
        kept.length === 0
          ? null
          : {
              page,
              spans: kept,
              quads: TextRange.quads(text, kept),
              text: TextRange.copied(text, kept),
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
    setSelected(null);
  }, [setSelected]);

  return { selected, gesture, selectAll, clear, texts };
}

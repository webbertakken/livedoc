'use client';

// The Text and Callout tools' marks (docs/specs/035-pdf-documents/marks.md "Making a mark"): a Callout's first press,
// kept across the pages so a press on another page lets it go, and each box typed in made into a mark, one step of the
// person's undo; a box ended with nothing typed makes none.
import { useCallback, useMemo, useState } from 'react';
import type { PagePoint, TypedMarkKind } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { MarkLooks } from './pdf-mark-looks';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { addTyped, TYPED_NAMES, TYPED_SIZE_PT, type Typed } from './pdf-typed';
import type { PdfDocumentOpen } from './usePdfDocument';

type Ready = Pick<
  Extract<PdfDocumentOpen, { phase: 'ready' }>,
  'pages' | 'storedFile' | 'binding' | 'undo'
>;

/** What a page types with while the Text or the Callout tool is in hand. */
export type PdfPageTyping = {
  readonly kind: TypedMarkKind;
  readonly colour: string;
  readonly opacity: number;
  readonly size: number;
  // A Callout's first press, on the page it landed on; null before one.
  readonly tip: { readonly index: number; readonly at: PagePoint } | null;
  // A Callout's first press made, or, null, let go.
  readonly onTip: (index: number, at: PagePoint | null) => void;
  // A box ended: what it makes, or null where nothing was typed.
  readonly onTyped: (index: number, kind: TypedMarkKind, typed: Typed | null) => void;
};

export function usePdfTyping({
  ready,
  author,
  authorKey,
  looks,
  inHand,
  onProblem,
}: {
  ready: Ready | null;
  author: string;
  // The author key this session holds (marks.md "Share roles"): what makes a mark made here its own.
  authorKey: string | null;
  // Each kind's look now.
  looks: MarkLooks;
  // The typing tool in hand; null while another is.
  inHand: TypedMarkKind | null;
  onProblem: (problem: string | null) => void;
}) {
  const [tip, setTip] = useState<PdfPageTyping['tip']>(null);

  const onTip = useCallback(
    (index: number, at: PagePoint | null) => setTip(at ? { index, at } : null),
    [],
  );

  const onTyped = useCallback(
    (index: number, kind: TypedMarkKind, typed: Typed | null) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      if (!typed) return debugLog(`[pdf] typing-dropped kind=${kind}`);
      const made = ready.undo.step({ page: page.name }, () =>
        addTyped(
          ready.binding.doc,
          { page: page.name, stored: { blob: ready.storedFile, pages: ready.pages.length } },
          typed,
          { author, authorKey, now: Date.now(), id: crypto.randomUUID(), look: looks[kind] },
        ),
      );
      if (made.ok) {
        debugLog(`[pdf] mark-added kind=${kind}`);
        track('Pdf', 'Added', `Mark.${TYPED_NAMES[kind]}`);
        onProblem(null);
      } else if (made.reason === 'pdf_too_many_marks') {
        debugLog('[pdf] limit-refused name=pdf_too_many_marks');
        onProblem(TOO_MANY_MARKS_COPY);
      } else debugLog(`[pdf] mark-refused name=${made.reason}`);
    },
    [ready, author, authorKey, looks, onProblem],
  );

  const typing = useMemo<PdfPageTyping | null>(
    () =>
      inHand ? { kind: inHand, ...looks[inHand], size: TYPED_SIZE_PT, tip, onTip, onTyped } : null,
    [inHand, looks, tip, onTip, onTyped],
  );

  /** Lets a Callout's first press go: another tool was taken. */
  const letGo = useCallback(() => setTip(null), []);

  return { typing, letGo };
}

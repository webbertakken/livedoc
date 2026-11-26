'use client';

// The Text and Callout tools' marks (docs/specs/035-pdf-documents/marks.md "Making a mark"): a Callout's first press,
// kept across the pages so a press on another page lets it go, and each box typed in made into a mark, one step of the
// person's undo; a box ended with nothing typed makes none. The words go to everyone as they are typed
// (live-editing-and-storage.md "A mark as it is made"): the first character makes the mark, each next changes it, and
// the whole box is one step, left open until the box ends.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PdfLiveChanges, type PagePoint, type TypedMarkKind } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { MarkLooks } from './pdf-mark-looks';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { addTyped, changeTyped, TYPED_NAMES, TYPED_SIZE_PT, type Typed } from './pdf-typed';
import { PDF_LOCAL_ORIGIN, type PdfOpenStep } from './pdf-undo';
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
  // The box's words changed: what it makes now, or null where nothing but spaces is typed.
  readonly onWords: (index: number, kind: TypedMarkKind, typed: Typed | null) => void;
  // A box ended: what it makes, or null where nothing was typed.
  readonly onTyped: (index: number, kind: TypedMarkKind, typed: Typed | null) => void;
  // The mark being typed, which the page leaves to the box; null while none is.
  readonly id: string | null;
};

/** The box being typed in: its page, its mark's id, its step, whether the mark stands, and whether it was refused. */
type TypingBox = {
  readonly index: number;
  readonly id: string;
  step: PdfOpenStep | null;
  made: boolean;
  refused: boolean;
};

/** Ends a box's step: kept where its mark stands, else left no step. */
const settle = (box: TypingBox) => (box.made ? box.step?.close() : box.step?.discard());

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

  const box = useRef<TypingBox | null>(null);
  const [id, setId] = useState<string | null>(null);

  const onWords = useCallback(
    (index: number, kind: TypedMarkKind, typed: Typed | null) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      if (box.current?.index !== index) {
        if (box.current) settle(box.current);
        box.current = { index, id: crypto.randomUUID(), step: null, made: false, refused: false };
        setId(box.current.id);
      }
      const now = box.current;
      if (now.refused) return;
      const doc = ready.binding.doc;
      if (typed && now.made) return changeTyped(doc, now.id, typed);
      if (!typed) {
        if (now.made) PdfLiveChanges.removeMark(doc, now.id, PDF_LOCAL_ORIGIN);
        now.made = false;
        return;
      }
      now.step ??= ready.undo.open({ page: page.name });
      const made = addTyped(
        doc,
        { page: page.name, stored: { blob: ready.storedFile, pages: ready.pages.length } },
        typed,
        { author, authorKey, now: Date.now(), id: now.id, look: looks[kind] },
      );
      if (made.ok) {
        now.made = true;
        return;
      }
      now.refused = true;
      if (made.reason === 'pdf_too_many_marks') {
        debugLog('[pdf] limit-refused name=pdf_too_many_marks');
        onProblem(TOO_MANY_MARKS_COPY);
      } else debugLog(`[pdf] mark-refused name=${made.reason}`);
    },
    [ready, author, authorKey, looks, onProblem],
  );

  const onTyped = useCallback(
    (index: number, kind: TypedMarkKind, typed: Typed | null) => {
      onWords(index, kind, typed);
      const ended = box.current?.index === index ? box.current : null;
      if (!ended) return;
      box.current = null;
      setId(null);
      settle(ended);
      if (ended.made) {
        debugLog(`[pdf] mark-added kind=${kind}`);
        track('Pdf', 'Added', `Mark.${TYPED_NAMES[kind]}`);
        onProblem(null);
      } else if (!ended.refused) debugLog(`[pdf] typing-dropped kind=${kind}`);
    },
    [onWords, onProblem],
  );

  // The tool put down, or the surface gone, mid-box: what was typed stays, its step closed as it stands.
  useEffect(
    () => () => {
      if (!box.current) return;
      settle(box.current);
      box.current = null;
      setId(null);
    },
    [inHand],
  );

  const typing = useMemo<PdfPageTyping | null>(
    () =>
      inHand
        ? { kind: inHand, ...looks[inHand], size: TYPED_SIZE_PT, tip, onTip, onWords, onTyped, id }
        : null,
    [inHand, looks, tip, onTip, onWords, onTyped, id],
  );

  /** Lets a Callout's first press go: another tool was taken. */
  const letGo = useCallback(() => setTip(null), []);

  return { typing, letGo };
}

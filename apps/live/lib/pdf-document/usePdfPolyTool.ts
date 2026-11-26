'use client';

// The corner tools' shape in the making (docs/specs/035-pdf-documents/marks.md "Making a mark"): a Polygon, a Cloud or
// Connected lines with its tool in hand, a corner a press on one page. A double press, Enter or a press on its first
// corner ends it, handed over to be made, one step of undo; Backspace takes the last corner back; Escape lets it go,
// as another tool does. Only the tool in hand's own shape is held: one of another kind is let go.
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import type { PolyMarkKind, PolyShape } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import {
  polyShapeOf,
  pressCorner,
  takeBackCorner,
  type CornerPress,
  type PolyDraft,
} from './pdf-poly';
import type { ToolLine } from './pdf-tool-look';

/** What the pages hold of the shape in the making, and what they hand it. */
export type PdfPolyShaping = {
  // The shape so far; null before its first corner.
  readonly draft: PolyDraft | null;
  readonly press: (press: CornerPress) => void;
  // A double press: the shape ended where it is.
  readonly end: () => void;
};

export function usePdfPolyTool({
  inHand,
  line,
  onShape,
}: {
  // The corner tool in hand; null while another is.
  inHand: PolyMarkKind | null;
  // The tool's line, which the mark takes.
  line: ToolLine & { width: number };
  // `shape` null for too few corners: nothing to make.
  onShape: (index: number, shape: PolyShape | null) => void;
}) {
  const [kept, setKept] = useState<PolyDraft | null>(null);
  const draft = inHand !== null && kept?.kind === inHand ? kept : null;

  const finish = useCallback(
    (ended: PolyDraft) => {
      debugLog(`[pdf] poly-ended kind=${ended.kind} corners=${ended.corners.length}`);
      onShape(ended.page, polyShapeOf(ended, line));
    },
    [line, onShape],
  );

  const press = useCallback(
    (at: CornerPress) => {
      if (!inHand) return;
      const pressed = pressCorner(inHand, draft, at);
      setKept(pressed.draft);
      if (pressed.ended) finish(pressed.ended);
    },
    [inHand, draft, finish],
  );

  const end = useCallback(() => {
    if (!draft) return;
    setKept(null);
    finish(draft);
  }, [draft, finish]);

  const letGo = useCallback(() => setKept(null), []);

  /** Enter, Backspace and Escape while a shape is in the making; true where one was taken. */
  const onKey = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (!draft || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === 'Enter') end();
    else if (event.key === 'Backspace') setKept(takeBackCorner(draft));
    else if (event.key === 'Escape') {
      debugLog(`[pdf] poly-let-go kind=${draft.kind}`);
      letGo();
    } else return false;
    event.preventDefault();
    return true;
  };

  const shaping = useMemo<PdfPolyShaping | null>(
    () => (inHand ? { draft, press, end } : null),
    [inHand, draft, press, end],
  );

  return { shaping, letGo, onKey };
}

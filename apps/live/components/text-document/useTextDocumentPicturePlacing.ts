'use client';

// Image options' Text wrapping and Position (docs/specs/034-text-documents/objects.md "In the editor"): the selected
// picture's placement read, and each choice, margin, switch and offset written as one undo step and counted. A picture
// leaving In line stays where it is drawn, and a switch between moving with text and fixed on the page keeps it in
// place: both measured from the writing as drawn, and nothing changes where they cannot be. An Editor's alone.
import { useCallback, useEffect, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import {
  PicturePlacements,
  type PictureMoves,
  type PicturePlacement,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import {
  selectedPicture,
  setPicturePlacement,
} from '@/lib/text-document/text-document-picture-edit';
import {
  paragraphOnPage,
  pictureSpot,
} from '@/lib/text-document/text-document-picture-placed-plugin';
import {
  moved,
  offset as offsetBy,
  shifted,
  withMargin,
  wrapped,
  type PictureWrapChoice,
} from '@/lib/text-document/text-document-picture-placing';
import { startUndoStep } from '@/lib/text-document/text-document-undo';
import type { PictureMove } from '@/lib/text-document/text-document-picture-move';

/** What Text wrapping and Position show of the selected picture: its placement (none in line), and whether pages are laid. */
export type PicturePlacing = { placement: PicturePlacement | undefined; paged: boolean };

type Selected = PicturePlacing & { pos: number };

const same = (a: Selected | null, b: Selected | null) => JSON.stringify(a) === JSON.stringify(b);

export function useTextDocumentPicturePlacing({
  view,
  canEdit,
  subscribe,
  paged,
}: {
  view: EditorView | null;
  canEdit: boolean;
  // Told when the caret moves or the writing changes.
  subscribe: (listener: () => void) => () => void;
  // Pages laid out: a pageless document has none to fix a picture on.
  paged: boolean;
}) {
  const read = useCallback((): Selected | null => {
    const found = view && !view.isDestroyed ? selectedPicture(view.state) : null;
    if (!found) return null;
    return { pos: found.pos, placement: PicturePlacements.of(found.node.attrs.placement), paged };
  }, [view, paged]);
  const [selected, setSelected] = useState(read);
  useEffect(() => {
    const update = () => {
      const now = read();
      setSelected((was) => (same(was, now) ? was : now));
    };
    update();
    return subscribe(update);
  }, [read, subscribe]);

  /** Writes what `next` gives for the selected picture (null: not measured), as one undo step. */
  const write = useCallback(
    (
      by: 'wrap' | 'margin' | 'moves' | 'offset' | 'drag',
      next: (now: Selected, view: EditorView) => PicturePlacement | undefined | null,
    ) => {
      const now = read();
      if (!canEdit || !view || view.isDestroyed || !now) return;
      const placement = next(now, view);
      if (placement === null) {
        debugLog('[text-document] picture placement not measured', { by, pos: now.pos });
        return;
      }
      startUndoStep(view);
      const done = setPicturePlacement(now.pos, placement)(view.state, view.dispatch);
      startUndoStep(view);
      debugLog('[text-document] picture placement', { by, done, wrap: placement?.wrap ?? null });
      if (done)
        track(
          'Element',
          'Changed',
          by === 'wrap' || by === 'margin' ? 'TextDocumentImageWrap' : 'TextDocumentImagePosition',
        );
    },
    [canEdit, read, view],
  );

  const wrap = useCallback(
    (choice: PictureWrapChoice) =>
      write('wrap', (now, v) =>
        wrapped(now.placement, choice, now.placement ? null : pictureSpot(v, now.pos)),
      ),
    [write],
  );
  const margin = useCallback(
    (pt: number) => write('margin', (now) => now.placement && withMargin(now.placement, pt)),
    [write],
  );
  const moves = useCallback(
    (to: PictureMoves) =>
      write(
        'moves',
        (now, v) =>
          now.placement &&
          moved(now.placement, to, to === now.placement.moves ? null : paragraphOnPage(v, now.pos)),
      ),
    [write],
  );
  const offset = useCallback(
    (axis: 'x' | 'y', pt: number) =>
      write('offset', (now) => now.placement && offsetBy(now.placement, axis, pt)),
    [write],
  );

  /** A placed picture's drag let go (objects.md "Dragging a placed picture"): moved by it, as one undo step. */
  const drag = useCallback(
    (pos: number, by: PictureMove) =>
      write('drag', (now) =>
        now.pos === pos && now.placement ? shifted(now.placement, by) : now.placement,
      ),
    [write],
  );

  const placing: PicturePlacing | null = selected
    ? { placement: selected.placement, paged: selected.paged }
    : null;
  return { placing, wrap, margin, moves, offset, drag };
}

/** The selected picture's Text wrapping and Position, and their writes. */
export type PicturePlacingControls = ReturnType<typeof useTextDocumentPicturePlacing>;

'use client';

// The selected picture's bar (docs/specs/034-text-documents/objects.md "The picture's bar"), portalled into the host
// under it: a drawing's Edit (Open for anyone who cannot edit) where it may be opened, and for whoever may edit the Text
// wrapping choices (the panel's own writes) and Image options. A plain picture has no bar for anyone who cannot edit.
// Only inside an editor.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { PICTURE, PicturePlacements } from '@livedoc/text-documents';
import { useOptionalEditorContext } from '@/app/document/[id]/EditorContext';
import { drawingOfPicture } from '@/lib/text-document/text-document-drawing-pictures';
import type { OpenDrawing } from '@/lib/text-document/text-document-drawing-open-plugin';
import { PICTURE_BAR_CLASS } from '@/lib/text-document/text-document-picture-bar';
import {
  wrapChoiceOf,
  type PictureWrapChoice,
} from '@/lib/text-document/text-document-picture-placing';
import { TextDocumentPictureBar } from './TextDocumentPictureBar';

/** The selected picture: where it is, its drawing tab if any, its wrap in force and its bar host. */
type SelectedPicture = {
  pos: number;
  drawingTabId: string | null;
  chosen: PictureWrapChoice;
  bar: HTMLElement | null;
};

function selectedIn(view: EditorView): SelectedPicture | null {
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== PICTURE) return null;
  const dom = view.nodeDOM(selection.from);
  return {
    pos: selection.from,
    drawingTabId: drawingOfPicture(selection.node),
    chosen: wrapChoiceOf(PicturePlacements.of(selection.node.attrs.placement)),
    bar:
      dom instanceof HTMLElement ? dom.querySelector<HTMLElement>(`.${PICTURE_BAR_CLASS}`) : null,
  };
}

const same = (a: SelectedPicture | null, b: SelectedPicture | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.pos === b.pos &&
    a.drawingTabId === b.drawingTabId &&
    a.chosen === b.chosen &&
    a.bar === b.bar);

export function useTextDocumentPictureBar({
  view,
  canEdit,
  subscribe,
  open,
  opens,
  wrap,
  options,
}: {
  view: EditorView | null;
  canEdit: boolean;
  // Told when the caret moves or the writing changes.
  subscribe: (listener: () => void) => () => void;
  // Opens a drawing from its picture; null where none may be opened. Whether one is there to open.
  open: OpenDrawing | null;
  opens: (drawingTabId: string) => boolean;
  // A Text wrapping choice, written as the panel writes it.
  wrap: (choice: PictureWrapChoice) => void;
  // Opens Image options.
  options: () => void;
}): ReactNode {
  const inEditor = useOptionalEditorContext() !== null;
  const [selected, setSelected] = useState<SelectedPicture | null>(null);
  useEffect(() => {
    if (!view) return;
    const update = () => {
      if (view.isDestroyed) return;
      const now = selectedIn(view);
      setSelected((was) => (same(was, now) ? was : now));
    };
    update();
    return subscribe(update);
  }, [view, subscribe]);

  const back = useCallback(() => view?.focus(), [view]);
  if (!inEditor || !selected?.bar) return null;
  const { drawingTabId, pos, chosen } = selected;
  const drawing =
    open && drawingTabId && opens(drawingTabId)
      ? { canEdit, onOpen: () => open(drawingTabId, pos) }
      : null;
  const wrapping = canEdit ? { chosen, onWrap: wrap, onOptions: options } : null;
  if (!drawing && !wrapping) return null;
  return createPortal(
    <TextDocumentPictureBar drawing={drawing} wrapping={wrapping} onBack={back} />,
    selected.bar,
  );
}

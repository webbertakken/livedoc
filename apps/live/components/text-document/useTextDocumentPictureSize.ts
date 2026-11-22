'use client';

// Sizing a selected picture (docs/specs/034-text-documents/objects.md "Working with a picture"): Format > Image > Image
// options' panel and its Size & rotation fields, the handles' drag written once on release, and Reset image; each one
// undo step, counted. The picture's own size is its pixels: its held bytes' header, or the gallery image as drawn. The
// items are dimmed while no picture is selected (Reset also while its own size is not known); an Editor's alone.
import { useCallback, useEffect, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { pictureHeader } from '@livedoc/office-packages';
import { TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  resetPicture,
  selectedPicture,
  setPictureSize,
} from '@/lib/text-document/text-document-picture-edit';
import { ownPictureSize } from '@/lib/text-document/text-document-picture-insert';
import {
  changedPictureSize,
  type PictureSize,
  type PictureSizeChange,
} from '@/lib/text-document/text-document-picture-size';
import { startUndoStep } from '@/lib/text-document/text-document-undo';
import type { PictureSizing } from './TextDocumentImageOptionsPanel';

/** The panel's item, and Reset image's. */
export const IMAGE_OPTIONS_ITEM = 'image-options';
export const IMAGE_RESET_ITEM = 'image-reset';

type Selected = PictureSizing & { pos: number; pixels: PictureSize | null };

const same = (a: Selected | null, b: Selected | null) => JSON.stringify(a) === JSON.stringify(b);

/** The pixels drawn: what the picture view noted from the loaded image. */
function drawnPixels(view: EditorView, pos: number): PictureSize | null {
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  const width = Number(dom.dataset.ownWidth);
  const height = Number(dom.dataset.ownHeight);
  return width > 0 && height > 0 ? { width, height } : null;
}

export function useTextDocumentPictureSize({
  view,
  liveDoc,
  canEdit,
  subscribe,
  toggle,
  room,
}: {
  view: EditorView | null;
  liveDoc: { readonly current: Y.Doc | null };
  canEdit: boolean;
  // Told when the caret moves or the writing changes.
  subscribe: (listener: () => void) => () => void;
  // The panel's own binding (useOfficePanels), dimmed here while no picture is selected.
  toggle: OfficeAction | undefined;
  // The room the caret's text has, in points.
  room: PictureSize;
}) {
  const read = useCallback((): Selected | null => {
    const found = view && !view.isDestroyed ? selectedPicture(view.state) : null;
    if (!view || !found) return null;
    const { media, width, height } = found.node.attrs;
    const held =
      typeof media === 'string' && liveDoc.current
        ? TextDocumentState.media(liveDoc.current, media)
        : undefined;
    const header = held?.bytes ? pictureHeader(held.bytes) : undefined;
    const pixels = header
      ? { width: header.width, height: header.height }
      : drawnPixels(view, found.pos);
    return {
      pos: found.pos,
      width: typeof width === 'number' ? width : 0,
      height: typeof height === 'number' ? height : 0,
      pixels,
      own: pixels ? ownPictureSize(pixels) : null,
    };
  }, [view, liveDoc]);
  const [selected, setSelected] = useState(read);
  useEffect(() => {
    const update = () => {
      const now = read();
      setSelected((was) => (same(was, now) ? was : now));
    };
    update();
    return subscribe(update);
  }, [read, subscribe]);

  /** Writes a size as one undo step: the handles' release, or a field of the panel. */
  const resize = useCallback(
    (pos: number, size: PictureSize, by: 'handle' | 'panel') => {
      if (!canEdit || !view || view.isDestroyed) return;
      startUndoStep(view);
      const done = setPictureSize(pos, size)(view.state, view.dispatch);
      startUndoStep(view);
      debugLog('[text-document] picture size', { done, by, ...size });
      if (done) track('Element', 'Changed', 'TextDocumentImageSize');
    },
    [canEdit, view],
  );

  const apply = useCallback(
    (change: PictureSizeChange, lock: boolean) => {
      const now = read();
      if (!now) return;
      const size = changedPictureSize(now, change, { lock, own: now.own, room });
      if (size) resize(now.pos, size, 'panel');
    },
    [read, resize, room],
  );

  const reset = useCallback(() => {
    const now = read();
    if (!canEdit || !view || view.isDestroyed || !now?.pixels) return;
    startUndoStep(view);
    const done = resetPicture(now.pos, now.pixels, room)(view.state, view.dispatch);
    startUndoStep(view);
    debugLog('[text-document] picture reset', { done });
    if (done) track('Element', 'Changed', 'TextDocumentImageReset');
  }, [canEdit, view, read, room]);

  const actions: OfficeActions =
    canEdit && view
      ? {
          ...(toggle ? { [IMAGE_OPTIONS_ITEM]: { ...toggle, disabled: selected === null } } : {}),
          [IMAGE_RESET_ITEM]: {
            run: () => {
              reset();
              view.focus();
            },
            disabled: !selected?.pixels,
          },
        }
      : {};
  return { picture: selected, apply, reset, resize, actions };
}

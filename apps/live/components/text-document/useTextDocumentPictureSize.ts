'use client';

// Sizing, cropping and turning a selected picture (docs/specs/034-text-documents/objects.md "Working with a picture"):
// Format > Image > Image options' panel and its Size & rotation fields, the handles' drag written once on release, the
// turning shortcuts (bound only while a picture is selected, so the keys move the caret otherwise), Reset image, and
// Crop image (begun here, each crop mark's drag written); each one undo step, counted. The picture's own size is its
// pixels: its held bytes' header, or the gallery image as drawn. The items are dimmed while no picture is selected
// (Reset also while its own size is not known); an Editor's alone.
import { useCallback, useEffect, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { pictureHeader } from '@livedoc/office-packages';
import { Pictures, TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  resetPicture,
  selectedPicture,
  setPictureCrop,
  setPictureColours,
  setPictureRotation,
  type PictureColoursChange,
  setPictureSize,
} from '@/lib/text-document/text-document-picture-edit';
import { PICTURE_TURN_KEYS, turnedBy } from '@/lib/text-document/text-document-picture-rotate';
import { beginCropping } from '@/lib/text-document/text-document-picture-cropping-plugin';
import type { CroppedPicture } from '@/lib/text-document/text-document-picture-crop';
import { PICTURE_DRAWN_EVENT } from '@/lib/text-document/text-document-pictures';
import { ownPictureSize } from '@/lib/text-document/text-document-picture-insert';
import {
  changedPictureSize,
  type PictureSize,
  type PictureSizeChange,
} from '@/lib/text-document/text-document-picture-size';
import { startUndoStep } from '@/lib/text-document/text-document-undo';
import { pictureColouring } from '@/lib/text-document/text-document-picture-colours';
import type { PictureSizing, PictureTurn } from './TextDocumentImageOptionsPanel';
import { drawingOfPicture } from '@/lib/text-document/text-document-drawing-pictures';

/** The panel's item, Reset image's and Crop image's. */
export const IMAGE_OPTIONS_ITEM = 'image-options';
export const IMAGE_RESET_ITEM = 'image-reset';
export const IMAGE_CROP_ITEM = 'image-crop';

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
    const { media, width, height, rotation, recolour, transparency, brightness, contrast } =
      found.node.attrs;
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
      rotation: Pictures.rotation(rotation) ?? 0,
      colours: pictureColouring({ recolour, transparency, brightness, contrast }),
      drawing: drawingOfPicture(found.node) !== null,
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
    // A gallery picture's own size is known once its image is drawn.
    const dom = view?.dom;
    dom?.addEventListener(PICTURE_DRAWN_EVENT, update);
    const unsubscribe = subscribe(update);
    return () => {
      dom?.removeEventListener(PICTURE_DRAWN_EVENT, update);
      unsubscribe();
    };
  }, [read, subscribe, view]);

  /** Writes a size as one undo step: the handles' release, or a field of the panel. */
  const resize = useCallback(
    (pos: number, size: PictureSize, by: 'handle' | 'panel') => {
      if (!canEdit || !view || view.isDestroyed) return;
      startUndoStep(view);
      const done = setPictureSize(pos, size)(view.state, view.dispatch);
      startUndoStep(view);
      debugLog('[text-document] picture size', { done, by, ...size });
      if (done) track('Element', 'Changed', 'TextDocumentImageSize');
      // A handle leaves the keyboard with the writing; the panel keeps it in its field.
      if (by === 'handle') view.focus();
    },
    [canEdit, view],
  );

  /** Writes a crop mark's drag as one undo step. */
  const crop = useCallback(
    (pos: number, next: CroppedPicture) => {
      if (!canEdit || !view || view.isDestroyed) return;
      startUndoStep(view);
      const done = setPictureCrop(pos, next)(view.state, view.dispatch);
      startUndoStep(view);
      debugLog('[text-document] picture crop', { done, width: next.width, height: next.height });
      if (done) track('Element', 'Changed', 'TextDocumentImageCrop');
      view.focus();
    },
    [canEdit, view],
  );

  /** Writes a turn as one undo step: the handle's release, a turning key, or the panel's Angle and buttons. */
  const rotate = useCallback(
    (pos: number, rotation: number, by: 'handle' | 'keys' | 'panel') => {
      if (!canEdit || !view || view.isDestroyed) return;
      startUndoStep(view);
      const done = setPictureRotation(pos, rotation)(view.state, view.dispatch);
      startUndoStep(view);
      debugLog('[text-document] picture rotation', { done, by, rotation });
      if (done) track('Element', 'Changed', 'TextDocumentImageRotate');
      if (by !== 'panel') view.focus();
    },
    [canEdit, view],
  );

  /** The panel's turn: an angle typed, or a quarter turn either way. */
  const turn = useCallback(
    (change: PictureTurn) => {
      const now = read();
      if (!now) return;
      const rotation = 'angle' in change ? change.angle : turnedBy(now.rotation, change.by);
      rotate(now.pos, rotation, 'panel');
    },
    [read, rotate],
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

  /** Writes Image options' Recolour choice or an adjustment let go, as one undo step. */
  const colour = useCallback(
    (change: PictureColoursChange) => {
      const now = read();
      if (!canEdit || !view || view.isDestroyed || !now) return;
      startUndoStep(view);
      const done = setPictureColours(now.pos, change)(view.state, view.dispatch);
      startUndoStep(view);
      debugLog('[text-document] picture colours', { done, change });
      if (done)
        track(
          'Element',
          'Changed',
          'recolour' in change ? 'TextDocumentImageRecolour' : 'TextDocumentImageAdjust',
        );
    },
    [canEdit, read, view],
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
          [IMAGE_CROP_ITEM]: {
            run: () => {
              if (selected) beginCropping(view, selected.pos);
              view.focus();
            },
            disabled: selected === null,
          },
          [IMAGE_RESET_ITEM]: {
            run: () => {
              reset();
              view.focus();
            },
            disabled: !selected?.pixels,
          },
          ...(selected
            ? Object.fromEntries(
                Object.entries(PICTURE_TURN_KEYS).map(([id, by]) => [
                  id,
                  {
                    // Read as the key is pressed: a key held turns on from the turn just written.
                    run: () => {
                      const now = read();
                      debugLog('[text-document] picture turn key', { id, at: now?.pos ?? null });
                      if (now) rotate(now.pos, turnedBy(now.rotation, by), 'keys');
                    },
                  },
                ]),
              )
            : {}),
        }
      : {};
  return { picture: selected, apply, reset, resize, crop, rotate, turn, colour, actions };
}

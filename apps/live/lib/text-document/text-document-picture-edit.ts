// Working with a picture (docs/specs/034-text-documents/objects.md "Working with a picture"): the one a selection holds
// whole, its alternative text and decorative mark, its media replaced in place, its size written (its crop kept as
// shares, so it scales), its turn, and Reset image: its own size fitted to the room, its crop and turn dropped.
import { NodeSelection, type Command, type EditorState } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import {
  PICTURE,
  PictureColours,
  Pictures,
  type PictureAdjustment,
  type PictureRecolour,
} from '@livedoc/text-documents';
import { insertedPictureSize } from './text-document-picture-insert';
import type { CroppedPicture } from './text-document-picture-crop';
import { hasPictureSize, type PictureSize } from './text-document-picture-size';

const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

/** The picture the selection holds whole, and where it is; none for any other selection. */
export function selectedPicture(state: EditorState): { pos: number; node: PmNode } | null {
  const { selection } = state;
  return selection instanceof NodeSelection && selection.node.type.name === PICTURE
    ? { pos: selection.from, node: selection.node }
    : null;
}

/** The picture at `pos`, or none. */
export const pictureAt = (state: EditorState, pos: number): PmNode | null => {
  const node = pos >= 0 && pos < state.doc.content.size ? state.doc.nodeAt(pos) : null;
  return node?.type.name === PICTURE ? node : null;
};

/** Writes the picture's description, or marks it decorative (its description emptied); the picture stays selected. */
export const setPictureAlt =
  (pos: number, { alt, decorative }: { alt: string; decorative: boolean }): Command =>
  (state, dispatch) => {
    const node = pictureAt(state, pos);
    if (!node) return false;
    const text = alt.trim();
    const tr = state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      alt: decorative || text === '' ? null : text,
      decorative: decorative ? true : null,
    });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    dispatch?.(tr);
    return true;
  };

/**
 * The picture showing new media: its alternative text, title, mark, width, turn, recolour and adjustments kept, its
 * height following the new picture's ratio, its crop dropped (default); the picture stays selected.
 */
export const replacePictureMedia =
  (pos: number, media: { key: string; pixels: { width: number; height: number } }): Command =>
  (state, dispatch) => {
    const node = pictureAt(state, pos);
    if (!node || media.pixels.width <= 0) return false;
    const width = typeof node.attrs.width === 'number' ? node.attrs.width : 0;
    const height = round3((width * media.pixels.height) / media.pixels.width);
    const tr = state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      media: media.key,
      height,
      crop: null,
    });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    dispatch?.(tr);
    return true;
  };

/** Writes the picture's size, its crop kept as shares (so it scales); the picture stays selected. */
export const setPictureSize =
  (pos: number, size: PictureSize): Command =>
  (state, dispatch) => {
    const node = pictureAt(state, pos);
    if (!node || !hasPictureSize(size)) return false;
    const width = round3(size.width);
    const height = round3(size.height);
    if (node.attrs.width === width && node.attrs.height === height) return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width, height });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    dispatch?.(tr);
    return true;
  };

/**
 * Reset image: its own size (of these pixels) fitted to the room, its crop, turn, recolour and adjustments dropped; it
 * stays selected.
 */
export const resetPicture =
  (pos: number, pixels: PictureSize, room: PictureSize): Command =>
  (state, dispatch) => {
    const node = pictureAt(state, pos);
    if (!node || !hasPictureSize(pixels)) return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ...insertedPictureSize(pixels, room),
      crop: null,
      rotation: null,
      recolour: null,
      transparency: null,
      brightness: null,
      contrast: null,
    });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    dispatch?.(tr);
    return true;
  };

/** Writes what a crop leaves: the picture's box and its crop (none when nothing is cut); the picture stays selected. */
export const setPictureCrop =
  (pos: number, next: CroppedPicture): Command =>
  (state, dispatch) => {
    const node = pictureAt(state, pos);
    if (!node || !hasPictureSize(next)) return false;
    const { width, height, crop } = node.attrs as Record<string, unknown>;
    if (JSON.stringify({ width, height, crop: crop ?? null }) === JSON.stringify(next))
      return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    dispatch?.(tr);
    return true;
  };

/** Writes the picture's turn, clockwise in degrees, as it holds one (none for a whole turn); it stays selected. */
export const setPictureRotation =
  (pos: number, rotation: number): Command =>
  (state, dispatch) => {
    const node = pictureAt(state, pos);
    if (!node || !Number.isFinite(rotation)) return false;
    const turn = Pictures.rotation(rotation) ?? null;
    if ((Pictures.rotation(node.attrs.rotation) ?? null) === turn) return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, rotation: turn });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    dispatch?.(tr);
    return true;
  };

/** A change from Image options' Recolour or Adjustments (objects.md "Working with a picture"). */
export type PictureColoursChange =
  | { readonly recolour: PictureRecolour | undefined }
  | { readonly adjustment: PictureAdjustment; readonly value: number };

/** Writes the picture's recolour, or one adjustment as it holds one (none for 0); it stays selected. */
export const setPictureColours =
  (pos: number, change: PictureColoursChange): Command =>
  (state, dispatch) => {
    const node = pictureAt(state, pos);
    if (!node) return false;
    const [name, value] =
      'recolour' in change
        ? ['recolour', PictureColours.recolour(change.recolour) ?? null]
        : [change.adjustment, PictureColours.adjustment(change.adjustment, change.value) ?? null];
    if ('adjustment' in change && !PictureColours.inRange(change.adjustment, change.value))
      return false;
    if (JSON.stringify(node.attrs[name] ?? null) === JSON.stringify(value)) return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, [name]: value });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    dispatch?.(tr);
    return true;
  };

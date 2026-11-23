// Working with a picture (docs/specs/034-text-documents/objects.md "Working with a picture"): the one a selection holds
// whole, its alternative text and decorative mark, its media replaced in place, its size written (its crop kept as
// shares, so it scales), and Reset image: its own size fitted to the room, its crop dropped.
import { NodeSelection, type Command, type EditorState } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { PICTURE } from '@livedoc/text-documents';
import { insertedPictureSize } from './text-document-picture-insert';
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
 * The picture showing new media: its alternative text, title, mark and width kept, its height following the new
 * picture's ratio, its crop dropped (default); the picture stays selected.
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

/** Reset image: its own size (of these pixels) fitted to the room, its crop dropped; the picture stays selected. */
export const resetPicture =
  (pos: number, pixels: PictureSize, room: PictureSize): Command =>
  (state, dispatch) => {
    const node = pictureAt(state, pos);
    if (!node || !hasPictureSize(pixels)) return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ...insertedPictureSize(pixels, room),
      crop: null,
    });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    dispatch?.(tr);
    return true;
  };

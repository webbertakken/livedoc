// A drawing's pictures in the writing (docs/specs/034-text-documents/objects.md "Its picture again"): the pictures
// naming a drawing tab, and its new PNG put in each, keeping its width, its height following the drawing's shape and
// its crop dropped, as Replace image does; the first one selected.
import type { Node as PmNode } from 'prosemirror-model';
import { NodeSelection, type Command } from 'prosemirror-state';
import { PICTURE } from '@livedoc/text-documents';

const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

/** The drawing tab a picture names, or null for a plain picture or another node. */
export const drawingOfPicture = (node: {
  type: { name: string };
  attrs: Readonly<Record<string, unknown>>;
}): string | null =>
  node.type.name === PICTURE && typeof node.attrs.drawing === 'string' && node.attrs.drawing
    ? node.attrs.drawing
    : null;

/** Where the pictures naming a drawing tab are, in document order. */
export function drawingPicturesIn(doc: PmNode, drawingTabId: string): number[] {
  const found: number[] = [];
  doc.descendants((node, pos) => {
    if (drawingOfPicture(node) === drawingTabId) found.push(pos);
    return !node.isAtom;
  });
  return found;
}

/** Puts a drawing's new picture in every picture naming it; false where none does. */
export const refreshDrawingPictures =
  (
    drawingTabId: string,
    media: { key: string; pixels: { width: number; height: number } },
  ): Command =>
  (state, dispatch) => {
    const at = drawingPicturesIn(state.doc, drawingTabId);
    if (at.length === 0 || media.pixels.width <= 0 || media.pixels.height <= 0) return false;
    const tr = state.tr;
    for (const pos of at) {
      const node = tr.doc.nodeAt(pos)!;
      const width = typeof node.attrs.width === 'number' ? node.attrs.width : 0;
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        media: media.key,
        height: round3((width * media.pixels.height) / media.pixels.width),
        crop: null,
      });
    }
    tr.setSelection(NodeSelection.create(tr.doc, at[0]!));
    dispatch?.(tr);
    return true;
  };

/** Points the picture at `pos` from one drawing tab to another (its own copy); false where it names another. */
export const repointDrawingPicture =
  (pos: number, from: string, to: string): Command =>
  (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node || drawingOfPicture(node) !== from) return false;
    dispatch?.(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, drawing: to }));
    return true;
  };

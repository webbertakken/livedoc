// Placing a picture (docs/specs/034-text-documents/objects.md "Inserting"): in line at the caret, replacing a selection,
// or at a drop point, and left selected, as Google leaves one; its size its pixels at 96 an inch, scaled down to fit
// the room the text has, keeping its ratio; its media the gallery image it was stored as, else its bytes.
import type { Command } from 'prosemirror-state';
import { NodeSelection } from 'prosemirror-state';
import { isMappedPictureType, mediaKeyOf, pictureHeader } from '@livedoc/office-packages';
import { Columns, PICTURE, type PageSetup, type PictureMedia } from '@livedoc/text-documents';
import type { MappedPictureType } from '@livedoc/office-packages';
import { textDocumentSchema as schema } from './text-document-schema';

/** The pixels an inch a placed picture is sized at, as Google sizes one (default). */
export const PICTURE_INSERT_DPI = 96;
const POINTS_AN_INCH = 72;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The size a picture of these pixels is placed at, in points, within the room (points) the text has. */
export function insertedPictureSize(
  pixels: { width: number; height: number },
  room: { width: number; height: number },
): { width: number; height: number } {
  const width = (pixels.width / PICTURE_INSERT_DPI) * POINTS_AN_INCH;
  const height = (pixels.height / PICTURE_INSERT_DPI) * POINTS_AN_INCH;
  const scale = Math.min(1, room.width / width, room.height / height);
  return { width: round3(width * scale), height: round3(height * scale) };
}

export type PictureBytes =
  | {
      ok: true;
      /** Its media key: the SHA-256 of its bytes. */
      key: string;
      mediaType: MappedPictureType;
      pixels: { width: number; height: number };
    }
  | { ok: false; error: 'unsupported_type' };

/** What the bytes are as a picture: its key, type and pixels; refused when no picture the model maps. */
export async function pictureFromBytes(bytes: Uint8Array): Promise<PictureBytes> {
  const header = pictureHeader(bytes);
  if (!header || !isMappedPictureType(header.mediaType) || header.width <= 0 || header.height <= 0)
    return { ok: false, error: 'unsupported_type' };
  return {
    ok: true,
    key: await mediaKeyOf(bytes),
    mediaType: header.mediaType,
    pixels: { width: header.width, height: header.height },
  };
}

/**
 * The media of a picture stored as `stored`: a gallery image's id, or none (the gallery could not hold it) or a data
 * URI (This Browser embeds rather than uploads), when the state holds its bytes.
 */
export function pictureMediaOf(
  mediaType: MappedPictureType,
  bytes: Uint8Array,
  stored: string | null,
): PictureMedia {
  return stored && !stored.startsWith('data:')
    ? { mediaType, image: stored }
    : { mediaType, bytes };
}

/** Places the picture at the caret (replacing a selection) or at `at`, and selects it. */
export const insertPicture =
  (picture: { key: string; width: number; height: number }, at?: number): Command =>
  (state, dispatch) => {
    const node = schema.nodes[PICTURE]!.create({
      media: picture.key,
      width: picture.width,
      height: picture.height,
    });
    const tr = state.tr;
    if (at === undefined) {
      if (!state.selection.$from.parent.inlineContent) return false;
      tr.replaceSelectionWith(node, false);
    } else {
      if (at < 0 || at > state.doc.content.size) return false;
      if (!state.doc.resolve(at).parent.inlineContent) return false;
      tr.insert(at, node);
    }
    // The picture sits just before where the mapping leaves the insertion's end.
    const end = at === undefined ? tr.selection.from : tr.mapping.map(at, 1);
    tr.setSelection(NodeSelection.create(tr.doc, end - node.nodeSize)).scrollIntoView();
    dispatch?.(tr);
    return true;
  };

/** The room a picture placed in a section has, in points: its column's width and its page's text height. */
export const pictureRoom = (setup: PageSetup): { width: number; height: number } => ({
  width: Columns.width(setup),
  height: setup.height - setup.margins.top - setup.margins.bottom,
});

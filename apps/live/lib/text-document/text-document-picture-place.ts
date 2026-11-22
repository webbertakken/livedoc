// Placing a picture brought into the writing (docs/specs/034-text-documents/objects.md "Inserting"): a file chosen,
// pasted or dropped is stored (the gallery, or its bytes where the gallery cannot hold it), then placed at the caret;
// a picture picked in the picker is already stored, its bytes read once for its key and type.
import type { Command } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { FEATURE_OFF_ERROR } from '@livedoc/api-schema';
import { TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { ImageUploadError } from '@/lib/upload-image';
import { startUndoStep } from './text-document-undo';
import {
  insertedPictureSize,
  insertPicture,
  pictureFromBytes,
  pictureMediaOf,
} from './text-document-picture-insert';

/** What a picture could not be placed for, when its bytes are no picture the writing holds. */
export const PICTURE_UNREADABLE = 'This picture could not be read. Use PNG, JPEG, GIF or WebP.';

export type PicturePlacing = {
  readonly view: () => EditorView | null;
  readonly doc: () => Y.Doc | null;
  /** The room the text has where the caret is, in points: its column's width and the page's text height. */
  readonly room: () => { width: number; height: number };
  /** Tells the person why a picture was not placed, in the picker's words. */
  readonly onRefused: (message: string) => void;
};

/** How a stored picture goes into the writing: inserted at the caret, or in a picture's place (Replace image). */
export type PutPicture = (picture: {
  key: string;
  pixels: { width: number; height: number };
  size: { width: number; height: number };
}) => Command;

export const INSERT_PICTURE: PutPicture = ({ key, size }) => insertPicture({ key, ...size });

/** The id a file is stored as in the gallery, or null where the gallery cannot hold it and the state keeps its bytes. */
export type StorePicture = (file: File) => Promise<string | null>;

/** Places one stored picture at the caret; false (and said why) when it cannot be placed. */
export async function placeStoredPicture(
  placing: PicturePlacing,
  bytes: Uint8Array,
  stored: string | null,
  put: PutPicture = INSERT_PICTURE,
): Promise<boolean> {
  const picture = await pictureFromBytes(bytes);
  if (!picture.ok) {
    placing.onRefused(PICTURE_UNREADABLE);
    debugLog('[text-document] picture refused', { reason: picture.error });
    return false;
  }
  const view = placing.view();
  const doc = placing.doc();
  if (!view || view.isDestroyed || !doc) return false;
  const media = pictureMediaOf(picture.mediaType, bytes, stored);
  TextDocumentState.addMedia(doc, { [picture.key]: media });
  const size = insertedPictureSize(picture.pixels, placing.room());
  // One insert or replacement is one undo step.
  startUndoStep(view);
  const placed = put({ key: picture.key, pixels: picture.pixels, size })(view.state, view.dispatch);
  startUndoStep(view);
  debugLog('[text-document] picture placed', {
    key: picture.key,
    gallery: media.image !== undefined,
    placed,
  });
  if (placed) view.focus();
  return placed;
}

/** Stores and places a file chosen, pasted or dropped; false (and said why) when it is not placed. */
export async function placePictureFile(
  placing: PicturePlacing,
  file: File,
  store: StorePicture,
  put: PutPicture = INSERT_PICTURE,
): Promise<boolean> {
  let stored: string | null;
  try {
    stored = await store(file);
  } catch (error) {
    const message =
      error instanceof ImageUploadError ? error.message : 'The picture could not be added.';
    placing.onRefused(message);
    debugLog('[text-document] picture not stored', {
      code: error instanceof ImageUploadError ? error.code : undefined,
      error: String(error),
    });
    return false;
  }
  return placeStoredPicture(placing, new Uint8Array(await file.arrayBuffer()), stored, put);
}

/** The store for a document: the gallery, or the bytes in the state where it answers `images_unavailable`. */
export const storeOrKeep =
  (add: (file: File) => Promise<{ image: { id: string } }>): StorePicture =>
  async (file) => {
    try {
      return (await add(file)).image.id;
    } catch (error) {
      if (error instanceof ImageUploadError && error.code === FEATURE_OFF_ERROR.images) return null;
      throw error;
    }
  };

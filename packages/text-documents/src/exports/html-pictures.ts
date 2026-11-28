// The pictures a Web Page or an EPUB carries beside its markup (docs/specs/034-text-documents/files-and-print.md
// "Downloading"): each media the written pictures hold, once, numbered in the order the markup first uses it. A media
// whose bytes are not in hand (a gallery image not read) has no file: its pictures are written as their alt text.
import { PICTURE_EXTENSIONS, type MappedPictureType } from '@livedoc/office-packages';
import { Pictures } from '../model/pictures';
import type { TextDocument } from '../model/text-document';

/** A picture's file beside the markup: its path from the markup, its media type and its bytes. */
export type ExportPicture = {
  readonly path: string;
  readonly mediaType: MappedPictureType;
  readonly bytes: Uint8Array;
};

/** The pictures the markup has used so far, and the path of a media, given its first use. */
export type ExportPictures = {
  /** The media's path as `images/<n>.<ext>`; none when its bytes are not in hand. */
  readonly pathOf: (key: string) => string | undefined;
  /** Every picture used, in order of first use. */
  readonly used: () => readonly ExportPicture[];
};

export function exportPictures(document: TextDocument): ExportPictures {
  const used = new Map<string, ExportPicture>();
  return {
    pathOf: (key) => {
      const known = used.get(key);
      if (known) return known.path;
      const held = Pictures.heldBytes(document, key);
      if (!held) return undefined;
      const path = `images/${used.size + 1}.${PICTURE_EXTENSIONS[held.mediaType]}`;
      used.set(key, { path, mediaType: held.mediaType, bytes: held.bytes });
      return path;
    },
    used: () => [...used.values()],
  };
}

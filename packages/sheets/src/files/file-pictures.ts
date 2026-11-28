// A sheet's images over cells as a file holds them (docs/specs/029-sheets/standard-mapping.md "Pictures in the file",
// D626): each a picture over the cells at its anchor cell and offset, its bytes read from the gallery by the download
// and handed to the writers; a picture without bytes is left out and named.
import { isMappedPictureType, type MappedPictureType } from '@livedoc/office-packages';
import { layoutIndex } from '../layout';
import type { SheetImage } from '../objects/sheet-image';
import type { Sheet } from '../sheet';
import type { FileLoss } from './workbook-file';

/** A picture over a sheet's cells, by grid place: its anchor cell and px into it, its size, its gallery image. */
export type FilePicture = {
  imageId: string;
  at: { r: number; c: number; dx: number; dy: number };
  width: number;
  height: number;
  alt?: string;
};

/** A picture's bytes and their stored type. */
export type FilePictureBytes = { data: Uint8Array; type: MappedPictureType };

/** What the download read for an image: its bytes, or `too_large` past the file's budget; absent, not served. */
export type FilePictureFetch = FilePictureBytes | 'too_large';
export type FilePictureFetches = ReadonlyMap<string, FilePictureFetch>;

/** (default, D626) The most picture bytes a file holds; past it, each further picture is left out and named. */
export const PICTURE_FILE_BYTES_MAX = 50 * 1024 * 1024;

/** The sheet's images over cells as its file holds them, in paint order; none when it holds none. */
export function filePicturesOf(sheet: Sheet): FilePicture[] {
  const images = (sheet.layout.objects ?? []).filter((x): x is SheetImage => x.kind === 'image');
  if (images.length === 0) return [];
  const ix = layoutIndex(sheet.layout);
  return images.map((image) => ({
    imageId: image.imageId,
    // An anchor's cell is always the sheet's: a deletion moves it to the line taking its place.
    at: {
      r: ix.rowPos.get(image.at.r)!,
      c: ix.colPos.get(image.at.c)!,
      dx: image.at.dx,
      dy: image.at.dy,
    },
    width: image.width,
    height: image.height,
    ...(image.alt ? { alt: image.alt } : {}),
  }));
}

/**
 * Which images of `sized` (id and byte size, in paint order, each once) a file reads within PICTURE_FILE_BYTES_MAX:
 * every one while the total holds, then none past it, so a file never holds a later picture in an earlier one's place.
 */
export function picturesWithinBudget(
  sized: readonly (readonly [string, number])[],
  budget = PICTURE_FILE_BYTES_MAX,
): Set<string> {
  const within = new Set<string>();
  let total = 0;
  for (const [id, size] of sized) {
    total += size;
    if (total > budget) break;
    within.add(id);
  }
  return within;
}

/** A stored type a file holds, or null for one it does not. */
export const filePictureType = (type: string | undefined): MappedPictureType | null =>
  type !== undefined && isMappedPictureType(type) ? type : null;

/** A sheet's pictures that have their bytes, each with them; the rest named in `losses` as left out. */
export function picturesWithBytes(
  sheet: { name: string; pictures?: readonly FilePicture[] },
  fetches: FilePictureFetches | undefined,
  losses: FileLoss[],
): { picture: FilePicture; bytes: FilePictureBytes }[] {
  const out: { picture: FilePicture; bytes: FilePictureBytes }[] = [];
  for (const picture of sheet.pictures ?? []) {
    const got = fetches?.get(picture.imageId);
    if (got && got !== 'too_large') out.push({ picture, bytes: got });
    else
      losses.push({
        k: 'picture_unwritten',
        sheet: sheet.name,
        why: got === 'too_large' ? 'too_large' : 'unavailable',
      });
  }
  return out;
}

/** Each of a sheet's pictures named left out, for a sheet keeping its file's own drawing (D261). */
export function picturesUnwritten(
  sheet: { name: string; pictures?: readonly FilePicture[] },
  losses: FileLoss[],
): void {
  for (const _ of sheet.pictures ?? [])
    losses.push({ k: 'picture_unwritten', sheet: sheet.name, why: 'kept_drawing' });
}

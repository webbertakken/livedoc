// A sheet's images over cells as a file holds them (docs/specs/029-sheets/standard-mapping.md "Pictures in the file",
// D626): each a picture over the cells at its anchor cell and offset, its bytes read from the gallery by the download
// and handed to the writers; a picture without bytes is left out and named. Read back (D628), a picture of PNG, JPEG,
// GIF or WebP bytes the file holds is a read picture, stored in the opener's gallery by the import.
import {
  isMappedPictureType,
  isPictureTooLarge,
  pictureHeader,
  type MappedPictureType,
} from '@livedoc/office-packages';
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

/** A picture over a sheet's cells as a file holds it, read (D628): its bytes and their type, its pixels, its place. */
export type ReadPicture = Omit<FilePicture, 'imageId'> & {
  bytes: Uint8Array;
  type: MappedPictureType;
  natural: { width: number; height: number };
};

/** The type and pixels of bytes a sheet holds as a picture: PNG, JPEG, GIF or WebP by their header, within its pixels. */
export function readablePicture(bytes: Uint8Array): Pick<ReadPicture, 'type' | 'natural'> | null {
  const header = pictureHeader(bytes);
  if (!header || !isMappedPictureType(header.mediaType) || isPictureTooLarge(bytes)) return null;
  return { type: header.mediaType, natural: { width: header.width, height: header.height } };
}

/** A picture held as a cell's value (inserted-objects.md "Images in a cell", D634): its gallery image and alt text. */
export type FileCellPicture = { imageId: string; alt?: string };

/** A cell's picture as a file holds it, read: its bytes, their type and pixels, its alt text. */
export type ReadCellPicture = Pick<ReadPicture, 'bytes' | 'type' | 'natural'> & { alt?: string };

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

/** A cell's picture's bytes, or null with it named left out (D634): its cell is written without it. */
export function cellPictureBytes(
  sheet: string,
  picture: FileCellPicture,
  fetches: FilePictureFetches | undefined,
  losses: FileLoss[],
): FilePictureBytes | null {
  const got = fetches?.get(picture.imageId);
  if (got && got !== 'too_large') return got;
  losses.push({
    k: 'picture_unwritten',
    sheet,
    why: got === 'too_large' ? 'too_large' : 'unavailable',
  });
  return null;
}

/** The gallery images a sheet's cells hold, in the order its cells are stored, each once. */
export function cellPictureIds(sheet: Pick<Sheet, 'cells'>): string[] {
  if (sheet.cells.pictureCount === 0) return [];
  const ids = new Set<string>();
  for (const cell of sheet.cells.values())
    if (cell.input && 'img' in cell.input) ids.add(cell.input.img.id);
  return [...ids];
}

/** Each of a sheet's pictures named left out, for a sheet keeping its file's own drawing (D261). */
export function picturesUnwritten(
  sheet: { name: string; pictures?: readonly unknown[] },
  losses: FileLoss[],
): void {
  for (const _ of sheet.pictures ?? [])
    losses.push({ k: 'picture_unwritten', sheet: sheet.name, why: 'kept_drawing' });
}

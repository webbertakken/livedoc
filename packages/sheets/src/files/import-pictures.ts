// Pictures read from a file, placed on opening (docs/specs/029-sheets/standard-mapping.md "Pictures in the file",
// "Stored on opening", D628, D634): each read picture becomes an image over cells, or its cell's picture, once the
// opener's gallery has stored its bytes, the same bytes stored once an import; one the gallery does not take, past its
// sheet's objects, or anchored past the sheet's grid is left out and named (`picture_unread`), as no drawing is left
// to keep it in; a cell's leaves its cell empty.
import type { MappedPictureType } from '@livedoc/office-packages';
import { makeAxisIds, type Rand } from '../ids';
import { SHEET_OBJECTS_MAX } from '../objects/sheet-objects';
import type { SheetImage } from '../objects/sheet-image';
import type { SheetLayout } from '../sheet';
import type { ReadCellPicture, ReadPicture } from './file-pictures';
import { pictureInput } from '../images/cell-picture';
import type { FileLoss, SheetFromFile } from './workbook-file';

/** Why a read picture is not placed: the gallery's answers, the sheet's objects full, or its anchor past the grid. */
export const PICTURE_UNSTORED = [
  'unavailable',
  'gallery_full',
  'too_large',
  'unreadable',
  'failed',
  'objects_full',
  'cut',
] as const;
export type PictureUnstored = (typeof PICTURE_UNSTORED)[number];

/** A read picture on its sheet, by row and column ids, waiting for the gallery's image id: over the cells, or in one. */
export type PictureToPlace = {
  sheetId: string;
  bytes: Uint8Array;
  type: MappedPictureType;
  natural: { width: number; height: number };
  place: { image: Omit<SheetImage, 'imageId'> } | { cell: { r: string; c: string; alt?: string } };
};

/** What the gallery answers for a picture: its image id, or why it did not take it. */
export type PictureStored =
  | { ok: true; imageId: string }
  | { ok: false; why: Exclude<PictureUnstored, 'objects_full' | 'cut'> };

/** Stores a picture's bytes in the opener's gallery. */
export type PictureStore = (picture: {
  data: Uint8Array;
  type: MappedPictureType;
  // Its pixels, from its header.
  natural: { width: number; height: number };
}) => Promise<PictureStored>;

/**
 * A sheet's read pictures by its row and column ids, after `taken` object ids; one anchored past the sheet's grid, or
 * past its objects, is named in `losses`.
 */
export function picturesToPlace(
  sheet: { id: string; title: string; layout: SheetLayout },
  pictures: readonly ReadPicture[] | undefined,
  rand: Rand,
  losses: FileLoss[],
): PictureToPlace[] {
  const out: PictureToPlace[] = [];
  const objects = sheet.layout.objects ?? [];
  const taken = new Set(objects.map((o) => o.id));
  let room = SHEET_OBJECTS_MAX - objects.length;
  for (const picture of pictures ?? []) {
    const r = sheet.layout.rows[picture.at.r];
    const c = sheet.layout.cols[picture.at.c];
    if (r === undefined || c === undefined || room <= 0) {
      losses.push({
        k: 'picture_unread',
        sheet: sheet.title,
        why: room <= 0 ? 'objects_full' : 'cut',
      });
      continue;
    }
    room -= 1;
    const id = makeAxisIds(1, rand, taken)[0]!;
    taken.add(id);
    out.push({
      sheetId: sheet.id,
      natural: picture.natural,
      place: {
        image: {
          id,
          kind: 'image',
          at: { r, c, dx: picture.at.dx, dy: picture.at.dy },
          width: picture.width,
          height: picture.height,
          naturalWidth: picture.natural.width,
          naturalHeight: picture.natural.height,
          ...(picture.alt ? { alt: picture.alt } : {}),
        },
      },
      bytes: picture.bytes,
      type: picture.type,
    });
  }
  return out;
}

/** A cell's read picture on its sheet, by the cell's row and column ids. */
export function cellPictureToPlace(
  sheetId: string,
  at: { r: string; c: string },
  picture: ReadCellPicture,
): PictureToPlace {
  return {
    sheetId,
    bytes: picture.bytes,
    type: picture.type,
    natural: picture.natural,
    place: { cell: { ...at, ...(picture.alt ? { alt: picture.alt } : {}) } },
  };
}

// The sheet's cells with the picture in the cell at `at`, its format kept.
function withCellPicture(
  cells: SheetFromFile['cells'],
  at: { r: string; c: string; alt?: string },
  imageId: string,
): SheetFromFile['cells'] {
  const i = pictureInput(imageId, at.alt);
  const found = cells.findIndex((cell) => cell.r === at.r && cell.c === at.c);
  if (found < 0) return [...cells, { r: at.r, c: at.c, i }];
  return cells.map((cell, n) => (n === found ? { ...cell, i } : cell));
}

/** What placing a file's pictures did: the sheets with their images, and how many were stored or left out. */
export type PicturesPlaced = { sheets: SheetFromFile[]; placed: number; left: number };

/**
 * The sheets with each picture `store` took placed over their cells, after their other objects, in the file's order;
 * the same bytes are stored once, and every picture not taken is named in `losses`.
 */
export async function picturesPlaced(
  sheets: readonly SheetFromFile[],
  pictures: readonly PictureToPlace[],
  store: PictureStore,
  losses: FileLoss[],
): Promise<PicturesPlaced> {
  const stored = new Map<Uint8Array, Promise<PictureStored>>();
  const answers = await Promise.all(
    pictures.map((p) => {
      let answer = stored.get(p.bytes);
      if (!answer) {
        // A store that throws leaves its picture out as failed, never the whole file.
        answer = store({ data: p.bytes, type: p.type, natural: p.natural }).catch(
          (): PictureStored => ({
            ok: false,
            why: 'failed',
          }),
        );
        stored.set(p.bytes, answer);
      }
      return answer;
    }),
  );
  const images = new Map<string, SheetImage[]>();
  const cells = new Map<string, { r: string; c: string; alt?: string; imageId: string }[]>();
  let placed = 0;
  pictures.forEach((p, i) => {
    const answer = answers[i]!;
    const title = sheets.find((s) => s.id === p.sheetId)!.title;
    if (!answer.ok) {
      losses.push({ k: 'picture_unread', sheet: title, why: answer.why });
      return;
    }
    placed += 1;
    if ('cell' in p.place) {
      const own = cells.get(p.sheetId) ?? [];
      cells.set(p.sheetId, [...own, { ...p.place.cell, imageId: answer.imageId }]);
      return;
    }
    images.set(p.sheetId, [
      ...(images.get(p.sheetId) ?? []),
      { ...p.place.image, imageId: answer.imageId },
    ]);
  });
  return {
    sheets: sheets.map((sheet) => {
      const own = images.get(sheet.id);
      const pictured = cells.get(sheet.id);
      if (!own && !pictured) return sheet;
      const objects = [...(sheet.layout.objects ?? []), ...(own ?? [])];
      return {
        ...sheet,
        layout: own ? { ...sheet.layout, objects } : sheet.layout,
        cells: (pictured ?? []).reduce(
          (all, at) => withCellPicture(all, at, at.imageId),
          sheet.cells,
        ),
      };
    }),
    placed,
    left: pictures.length - placed,
  };
}

// A spreadsheet's images over cells for an agent (docs/specs/029-sheets/inserted-objects.md "Images over cells",
// "Agents"): change_sheet's `image` places one of the caller's gallery pictures at a cell (a new one on top, or in the
// place of the one `replace` names) or, with `inCell`, in a cell as its value ("Images in a cell"), `clear_images`
// takes one or all off the sheet, and read_sheet lists them as A1, the cells' pictures after. The gallery check
// (image_not_found) is the caller's: the natural sizes handed in are the gallery's. Pure.
import {
  fittedImageSize,
  formatA1,
  layoutIndex,
  makeAxisIds,
  parseA1,
  pictureInput,
  pictureOfInput,
  SHEET_IMAGE_ALT_MAX,
  SHEET_IMAGE_SIZE,
  splitCellKey,
  type Rand,
  type SheetImage,
  type SheetLayout,
  type SheetWrite,
  type Workbook,
} from '@livedoc/sheets';
import type { SheetRefusal } from './sheet-state';

export type SheetImageChange = {
  op: 'image';
  imageId: string;
  at: string;
  width?: number;
  height?: number;
  alt?: string;
  replace?: string;
  // In the cell `at` as its value, not over the cells (D630).
  inCell?: boolean;
};

/** A gallery picture's natural size, as the gallery lists it. */
export type GalleryPicture = { width: number; height: number };

/** An image over cells as read_sheet lists it, or a cell's picture (`inCell`). */
export type ImageRead =
  | { id: string; imageId: string; at: string; width: number; height: number; alt?: string }
  | { imageId: string; at: string; alt?: string; inCell: true };

const refuse = (code: string, message: string): SheetRefusal => ({ ok: false, code, message });

const images = (layout: SheetLayout): SheetImage[] =>
  (layout.objects ?? []).filter((x): x is SheetImage => x.kind === 'image');

// The refusal for an image id the sheet does not hold, naming those it does.
function noImage(layout: SheetLayout, id: string): SheetRefusal {
  return refuse(
    'sheet_image_not_found',
    `No image "${id}" on this sheet. Its images: ${
      images(layout)
        .map((x) => x.id)
        .join(', ') || 'none'
    } (read_sheet lists them).`,
  );
}

const inBounds = (n: number) => n >= SHEET_IMAGE_SIZE.min && n <= SHEET_IMAGE_SIZE.max;

// Its box: as given, one side from the other by the picture's proportion, or the picture fitted to 600 by 400.
function sizeOf(
  change: SheetImageChange,
  natural: GalleryPicture,
): { width: number; height: number } | SheetRefusal {
  const ratio = natural.width >= 1 && natural.height >= 1 ? natural.width / natural.height : 1;
  const { width, height } = change;
  const size =
    width !== undefined && height !== undefined
      ? { width, height }
      : width !== undefined
        ? { width, height: Math.round(width / ratio) }
        : height !== undefined
          ? { width: Math.round(height * ratio), height }
          : fittedImageSize(natural);
  if (!inBounds(size.width) || !inBounds(size.height))
    return refuse(
      'write_invalid',
      `An image is ${SHEET_IMAGE_SIZE.min} to ${SHEET_IMAGE_SIZE.max} px a side; this one would be ${size.width}x${size.height}.`,
    );
  return size;
}

/** The layout write that places the picture `change` names (its gallery size `natural`), and its line. */
export function buildImageChange(
  wb: Workbook,
  sheetId: string,
  change: SheetImageChange,
  natural: GalleryPicture,
  rand: Rand,
): { ok: true; writes: SheetWrite[]; line: string } | SheetRefusal {
  const { layout } = wb.sheet(sheetId)!;
  const cell = parseA1(change.at.trim());
  if (!cell) return refuse('range_invalid', `"${change.at}" is not a cell in A1 form ("B4").`);
  const r = layout.rows[cell.r];
  const c = layout.cols[cell.c];
  if (!r || !c)
    return refuse('range_invalid', `${change.at} is past the sheet's last row or column.`);
  if (change.alt !== undefined && change.alt.length > SHEET_IMAGE_ALT_MAX)
    return refuse('write_invalid', `Alt text is up to ${SHEET_IMAGE_ALT_MAX} characters.`);
  const place = formatA1(cell.r, cell.c);
  if (change.inCell) {
    if (change.width !== undefined || change.height !== undefined || change.replace !== undefined)
      return refuse(
        'write_invalid',
        'A picture in a cell fills its cell: width, height and replace are for one over the cells.',
      );
    return {
      ok: true,
      writes: [
        { kind: 'cells', cells: [{ r, c, i: pictureInput(change.imageId, change.alt?.trim()) }] },
      ],
      line: `put the image in ${place}`,
    };
  }
  const replaced = change.replace;
  if (replaced !== undefined && !images(layout).some((x) => x.id === replaced))
    return noImage(layout, replaced);
  const size = sizeOf(change, natural);
  if ('ok' in size) return size;
  const id = replaced ?? makeAxisIds(1, rand, new Set((layout.objects ?? []).map((x) => x.id)))[0]!;
  const alt = change.alt?.trim();
  const image: SheetImage = {
    id,
    kind: 'image',
    at: { r, c, dx: 0, dy: 0 },
    ...size,
    imageId: change.imageId,
    ...(natural.width >= 1 && natural.height >= 1
      ? { naturalWidth: natural.width, naturalHeight: natural.height }
      : {}),
    ...(alt ? { alt } : {}),
  };
  return {
    ok: true,
    writes: [{ kind: 'layout', changes: [{ k: 'object', id, object: image }] }],
    line: `${replaced ? `placed the image (in place of ${replaced})` : 'placed the image'} at ${place} ${size.width}x${size.height} (image ${id})`,
  };
}

/** The write taking the sheet's image `id` off, or every image (none: no write). */
export function imagesClearWrite(
  layout: SheetLayout,
  id: string | undefined,
): { ok: true; write: SheetWrite | null; count: number } | SheetRefusal {
  if (id !== undefined && !images(layout).some((x) => x.id === id)) return noImage(layout, id);
  const gone = images(layout).filter((x) => id === undefined || x.id === id);
  return {
    ok: true,
    count: gone.length,
    write: gone.length
      ? {
          kind: 'layout',
          changes: gone.map((x) => ({ k: 'object' as const, id: x.id, object: null })),
        }
      : null,
  };
}

/**
 * The sheet's images over cells as read_sheet lists them (their ids, cells, sizes, gallery ids and alt text), then
 * its cells' pictures row by row.
 */
export function imagesRead(wb: Workbook, sheetId: string): ImageRead[] {
  const sheet = wb.sheet(sheetId)!;
  const { layout } = sheet;
  const ix = layoutIndex(layout);
  const over: ImageRead[] = images(layout).map((x) => ({
    id: x.id,
    imageId: x.imageId,
    // An anchor's cell is always the sheet's: a deletion moves it to the line taking its place.
    at: formatA1(ix.rowPos.get(x.at.r)!, ix.colPos.get(x.at.c)!),
    width: x.width,
    height: x.height,
    ...(x.alt ? { alt: x.alt } : {}),
  }));
  if (sheet.cells.pictureCount === 0) return over;
  // Its cells' pictures by their cells' places, row by row.
  const held: { r: number; c: number; read: ImageRead }[] = [];
  for (const [key, cell] of sheet.cells) {
    const picture = pictureOfInput(cell.input);
    if (!picture) continue;
    const { r: rowId, c: colId } = splitCellKey(key);
    const r = ix.rowPos.get(rowId)!;
    const c = ix.colPos.get(colId)!;
    const alt = picture.alt ? { alt: picture.alt } : {};
    held.push({ r, c, read: { imageId: picture.id, at: formatA1(r, c), ...alt, inCell: true } });
  }
  held.sort((a, b) => a.r - b.r || a.c - b.c);
  return [...over, ...held.map((x) => x.read)];
}

// Which picture a cell shows (docs/specs/029-sheets/imports.md "IMAGE"): the picture it holds (inserted-objects.md
// "Images in a cell", D631), else the IMAGE its own formula works out (in its place of a spill), else the picture of the
// one cell its answer is a reference to, else of the cell a lookup found.
// The grid asks for each visible cell on every paint, so each formula's run is kept until the workbook changes.
import type { Value } from '../formula/values';
import type { CellImage } from '../images/cell-image';
import type { CellPicture } from '../sheet';
import { isRef, type CellAt, type DrawHooks } from './frame';

export const IMAGE_FUNCTION_NAMES: ReadonlySet<string> = new Set(['IMAGE']);

/** The cells followed from one to the next at most (D72): `=B2` of `=C2` of an IMAGE is 2. Safe range 2 to 32. */
export const IMAGE_FOLLOW_MAX = 8;

/** What one run of a formula drew: its pictures by place in its answer, the cell it answered, the cell it found. */
export type ImageRun = {
  readonly images: ReadonlyMap<string, CellImage>;
  readonly ref: CellAt | null;
  readonly found: CellAt | null;
};

/** A picture a cell shows: an IMAGE's from an address, or one of the gallery a cell holds. */
export type ShownImage = CellImage | CellPicture;

/** Whether a shown picture is an IMAGE's. */
export const isWebImage = (image: ShownImage): image is CellImage => 'url' in image;

/** What the finder reads of its workbook. */
export type ImageSource = {
  version(): number;
  // Whether any formula of the workbook calls IMAGE: none, and no cell shows a picture.
  callsImage(): boolean;
  // Whether any cell of the workbook holds a picture.
  holdsPictures(): boolean;
  // The picture the cell holds, or null.
  picture(sheetId: string, r: number, c: number): CellPicture | null;
  value(sheetId: string, r: number, c: number): Value;
  // The formula whose spill covers the cell, when it is not the cell itself.
  spillOwnerAt(sheetId: string, r: number, c: number): { r: number; c: number } | null;
  // The formula at the cell worked out again with the hooks; false for a cell without one.
  redraw(sheetId: string, r: number, c: number, hooks: DrawHooks): boolean;
};

export function placeKey(i: number, j: number): string {
  return `${i},${j}`;
}

export class ImageFinder {
  private readonly src: ImageSource;
  private version = -1;
  private anyImage = false;
  private readonly runs = new Map<string, ImageRun | null>();

  constructor(src: ImageSource) {
    this.src = src;
  }

  /** The picture the cell shows, or null. */
  imageOf(sheetId: string, r: number, c: number): ShownImage | null {
    const version = this.src.version();
    if (version !== this.version) {
      this.version = version;
      this.runs.clear();
      this.anyImage = this.src.callsImage() || this.src.holdsPictures();
    }
    return this.anyImage ? this.find(sheetId, r, c, 0) : null;
  }

  // The formula at (r, c) worked out again, noting what it draws, the one cell it answers and the cell it found.
  private run(sheetId: string, r: number, c: number): ImageRun | null {
    const images = new Map<string, CellImage>();
    let ref: CellAt | null = null;
    let found: CellAt | null = null;
    const ran = this.src.redraw(sheetId, r, c, {
      drawImage: (image, [i, j]) => images.set(placeKey(i, j), image),
      foundCell: (cell) => {
        found = cell;
      },
      answer: (raw) => {
        if (isRef(raw) && raw.ref.r1 === raw.ref.r2 && raw.ref.c1 === raw.ref.c2)
          ref = { sheetId: raw.ref.sheetId, r: raw.ref.r1, c: raw.ref.c1 };
      },
    });
    return ran ? { images, ref, found } : null;
  }

  private find(sheetId: string, r: number, c: number, depth: number): ShownImage | null {
    // A picture's cell shows empty text; anything else (an error, a value) is shown instead.
    if (depth > IMAGE_FOLLOW_MAX || this.src.value(sheetId, r, c) !== '') return null;
    const held = this.src.picture(sheetId, r, c);
    if (held) return held;
    const owner = this.src.spillOwnerAt(sheetId, r, c) ?? { r, c };
    const key = `${sheetId}!${owner.r},${owner.c}`;
    if (!this.runs.has(key)) this.runs.set(key, this.run(sheetId, owner.r, owner.c));
    const run = this.runs.get(key)!;
    if (!run) return null;
    const drawn = run.images.get(placeKey(r - owner.r, c - owner.c));
    if (drawn) return drawn;
    // A cell of a spill shows only what was drawn in its place.
    if (owner.r !== r || owner.c !== c) return null;
    const next = run.ref ?? run.found;
    return next ? this.find(next.sheetId, next.r, next.c, depth + 1) : null;
  }
}

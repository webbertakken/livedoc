// A picture in a cell (docs/specs/029-sheets/imports.md "IMAGE"): what IMAGE's arguments ask for. The engine makes
// it; the grid draws it in its cell's box by its mode (SheetImage).
import { importUrl, IMPORT_WORDS } from '../imports/import-request';
import { err, isError, toNumber, toText, type Scalar, type SheetError } from '../formula/values';

/** Google's sizing modes: 1 fit in proportion, 2 stretch, 3 own size, 4 the given size (verified: Google's help). */
export type ImageMode = 1 | 2 | 3 | 4;

/** What IMAGE asks for: the address, its mode and, in mode 4 only, the sizes given (null when left out). */
export type CellImage = {
  readonly url: string;
  readonly mode: ImageMode;
  readonly height: number | null;
  readonly width: number | null;
};

const BAD_ARGUMENTS = 'IMAGE takes a mode from 1 to 4, and sizes above 0';

// A size argument of mode 4: null when left out, else a number above 0.
function sizeOf(x: Scalar | undefined, locale: string): number | null | SheetError {
  if (x === undefined || x === null) return null;
  const n = toNumber(x, locale);
  if (isError(n)) return n;
  return n > 0 ? n : err('#VALUE!', BAD_ARGUMENTS);
}

/** IMAGE's arguments read as Google reads them: the address as an import's (D61), the sizes only in mode 4 (D72). */
export function readImageArgs(
  args: readonly (Scalar | undefined)[],
  locale: string,
): CellImage | SheetError {
  const text = toText(args[0] ?? null, locale);
  if (isError(text)) return text;
  const modeArg = args[1];
  const mode = modeArg === undefined || modeArg === null ? 1 : toNumber(modeArg, locale);
  if (isError(mode)) return mode;
  if (mode !== 1 && mode !== 2 && mode !== 3 && mode !== 4) return err('#VALUE!', BAD_ARGUMENTS);
  const height = mode === 4 ? sizeOf(args[2], locale) : null;
  if (isError(height)) return height;
  const width = mode === 4 ? sizeOf(args[3], locale) : null;
  if (isError(width)) return width;
  const url = importUrl(text);
  if (!url) return err('#N/A', IMPORT_WORDS.urlNotFound(text));
  return { url, mode, height, width };
}

/** The host a picture comes from, for the name assistive technology reads ("Image from <host>"). */
export function imageHost(image: CellImage): string {
  return new URL(image.url).hostname;
}

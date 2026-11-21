// IMAGE (docs/specs/029-sheets/imports.md "IMAGE"): its value is empty text; its picture is drawn from the formula
// worked out again with Frame.drawImage set (Workbook.imageOf), so it draws through IF and in its place of a spill.
// Its address may not read NOW or RAND, and it waits for Allow Access as the imports do.
import { readImageArgs } from '../../images/cell-image';
import { IMPORT_WORDS } from '../../imports/import-request';
import { lazyFn, lift, valueArg, type FnDef } from '../fn';
import { err, isError, type Value } from '../values';

export const IMAGE_FUNCTIONS: Record<string, FnDef> = {
  IMAGE: lazyFn(1, 4, (thunks, f) => {
    // Read whole inside the watch, so a cell the arguments name is read (and its NOW seen) there.
    const [args, readsNow] = f.watchNow(() =>
      thunks.map((t): Value => {
        const v = t();
        return v === null ? null : valueArg(v, f);
      }),
    );
    if (readsNow) return err('#ERROR!', IMPORT_WORDS.volatile);
    return lift(args, (xs, at) => {
      const image = readImageArgs(xs);
      if (isError(image)) return image;
      if (f.importAccess() === 'blocked') return err('#REF!', IMPORT_WORDS.blocked);
      f.drawImage?.(image, at);
      return '';
    });
  }),
};

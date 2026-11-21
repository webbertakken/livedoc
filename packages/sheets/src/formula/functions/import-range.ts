// IMPORTRANGE (docs/specs/029-sheets/formulas.md "Other workbooks"): a range of another LiveDoc spreadsheet, asked of
// the page as the web imports are and answered with the source's values. Which spreadsheet and which range are
// checked here, before anything is asked; whether the reader may read it, and what is there, is the api's to say.
import { rangeSource, rangeStringOk, RANGE_WORDS } from '../../imports/range-import';
import { textArg, type FnDef } from '../fn';
import { err, isError } from '../values';
import { importFn } from './imports';

export const IMPORT_RANGE_FNS: Record<string, FnDef> = {
  IMPORTRANGE: importFn(2, 2, (args, f) => {
    const address = textArg(args[0]!, f);
    if (isError(address)) return address;
    const source = rangeSource(address);
    if (!source) return err('#REF!', RANGE_WORDS.onlyLiveDoc);
    const range = textArg(args[1]!, f);
    if (isError(range)) return range;
    if (!rangeStringOk(range)) return err('#REF!', RANGE_WORDS.notFound);
    return { kind: 'range', source, range: range.trim() };
  }),
};

// Numbers in other bases (docs/specs/029-sheets/formulas.md "Functions": Math): BASE writes one, DECIMAL reads one,
// in bases 2 to 36 with the digits 0-9 then A-Z.
import { fn, intArg, opt, textArg, type FnDef } from '../fn';
import { err, isError } from '../values';

const BASE_MIN = 2;
const BASE_MAX = 36;
// The text either reads or writes: Google's and Excel's 255 characters.
export const BASE_TEXT_MAX = 255;

function badBase(base: number): boolean {
  return base < BASE_MIN || base > BASE_MAX;
}

export const BASE_FUNCTIONS: Record<string, FnDef> = {
  BASE: fn(2, 3, (args, f) => {
    const value = intArg(args[0]!, f);
    const base = intArg(args[1]!, f);
    const length = opt(args, 2, f, intArg, 0);
    if (isError(value)) return value;
    if (isError(base)) return base;
    if (isError(length)) return length;
    if (value < 0 || value > Number.MAX_SAFE_INTEGER) return err('#NUM!', 'BASE writes 0 to 2^53');
    if (badBase(base)) return err('#NUM!', 'The base is 2 to 36');
    if (length < 0 || length > BASE_TEXT_MAX) return err('#NUM!', 'The length is 0 to 255');
    return value.toString(base).toUpperCase().padStart(length, '0');
  }),
  // A hexadecimal text may start 0x, as LibreOffice reads it; empty text is 0.
  DECIMAL: fn(2, 2, (args, f) => {
    const text = textArg(args[0]!, f);
    const base = intArg(args[1]!, f);
    if (isError(text)) return text;
    if (isError(base)) return base;
    if (badBase(base)) return err('#NUM!', 'The base is 2 to 36');
    if (text.length > BASE_TEXT_MAX) return err('#NUM!', 'At most 255 characters');
    const digits = (base === 16 ? text.replace(/^0x/i, '') : text).toUpperCase();
    let out = 0;
    for (const ch of digits) {
      const d = parseInt(ch, BASE_MAX);
      if (Number.isNaN(d) || d >= base)
        return err('#NUM!', `"${text}" is not a number in base ${base}`);
      out = out * base + d;
    }
    return out;
  }),
};

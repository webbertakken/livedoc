// Web functions (docs/specs/029-sheets/formulas.md "Functions": Web): links and addresses, and the functions that
// fetch through the api Worker (imports.ts, image.ts, S4), and IMPORTRANGE, which reads LiveDoc through it.
import { isUrl } from '../../text-checks';
import { IMAGE_FUNCTIONS } from './image';
import { IMPORT_FNS } from './imports';
import { IMPORT_RANGE_FNS } from './import-range';
import { SPARKLINE_FUNCTIONS } from './sparkline';
import { scalarFn, type FnDef } from '../fn';
import { isError, toText } from '../values';

// Letters, digits, -, _ and . stand, as Google keeps them; every other byte of the text's UTF-8 is written %XX, so
// "hello, world!" is hello%2C%20world%21 as Google's help shows, and ~ is %7E.
const UNRESERVED = /[A-Za-z0-9\-_.]/;

export function encodeUrl(text: string): string {
  let out = '';
  for (const ch of text) {
    if (UNRESERVED.test(ch)) out += ch;
    else
      for (const byte of new TextEncoder().encode(ch))
        out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

export const WEB_FUNCTIONS: Record<string, FnDef> = {
  ...IMPORT_FNS,
  ...IMPORT_RANGE_FNS,
  ENCODEURL: scalarFn(1, 1, ([x], f) => {
    const t = toText(x!, f.locale);
    return isError(t) ? t : encodeUrl(t);
  }),
  // A mailto: address is no URL to Google's ISURL, though a link may hold one.
  ISURL: scalarFn(1, 1, ([x]) => typeof x === 'string' && isUrl(x) && !/^\s*mailto:/i.test(x)),
  // The value is the label; where it goes is Workbook.hyperlinkOf's, read from the formula (safeHyperlink). A label
  // read from an empty cell shows the address; an empty text label shows nothing.
  HYPERLINK: scalarFn(1, 2, ([url, label]) =>
    label === undefined || label === null ? url! : label,
  ),
  ...SPARKLINE_FUNCTIONS,
  ...IMAGE_FUNCTIONS,
};

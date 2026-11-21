// The conversion dialog's words (docs/specs/029-sheets/files-and-print.md "Converting", D88): its title, and one line
// a loss, counted, naming up to three sheets or functions. Pure, so every line is tested without React.
import type { WorkbookFormat } from '@livedoc/sheets';
import type { ConversionLoss } from '@livedoc/sheets/files';

/** The names a line shows before it counts the rest. */
export const CONVERSION_NAMES_SHOWN = 3;

/** Why the dialog opened: to change the workbook's format, or to download a converted copy. */
export type ConversionPurpose = 'convert' | 'download';

const FORMAT_NAME: Record<WorkbookFormat, string> = {
  xlsx: 'Excel',
  ods: 'OpenDocument',
  fods: 'OpenDocument',
};

export const formatName = (format: WorkbookFormat): string => FORMAT_NAME[format];

export function conversionTitle(purpose: ConversionPurpose, to: WorkbookFormat): string {
  return `${purpose === 'convert' ? 'Convert to' : 'Download as'} ${FORMAT_NAME[to]}?`;
}

export const conversionChecking = (to: WorkbookFormat): string =>
  `Checking what the .${to} file can hold…`;

export const CONVERSION_CHECK_FAILED = 'This spreadsheet could not be checked. Try again.';

/** The line above the losses, or the whole message when there are none. */
export function conversionLead(to: WorkbookFormat, losses: readonly ConversionLoss[]): string {
  return losses.length > 0
    ? `The .${to} file cannot hold:`
    : `Everything in this spreadsheet fits the ${FORMAT_NAME[to]} format.`;
}

// Up to three names, then how many more: "A, B and C", "A, B, C and 2 more" (or "or").
function named(names: readonly string[], word: 'and' | 'or'): string {
  const shown = names.slice(0, CONVERSION_NAMES_SHOWN);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} ${word} ${rest} more`;
  if (shown.length === 1) return shown[0]!;
  return `${shown.slice(0, -1).join(', ')} ${word} ${shown.at(-1)!}`;
}

const quoted = (text: string) => `“${text}”`;

/** One loss as the dialog lists it. */
export function conversionLine(loss: ConversionLoss, to: WorkbookFormat): string {
  const one = loss.count === 1;
  switch (loss.k) {
    case 'sheet_renamed': {
      const renames = loss.names.map((r) => `${quoted(r.from)} becomes ${quoted(r.to)}`);
      const what = one ? '1 sheet name is' : `${loss.count} sheet names are`;
      return `${what} cut to Excel’s 31 characters: ${named(renames, 'and')}`;
    }
    case 'formula_uncalculated': {
      const app = to === 'xlsx' ? 'Excel' : 'other apps';
      const what = one
        ? `1 formula keeps only its last value in ${app}`
        : `${loss.count} formulas keep only their last values in ${app}`;
      const why = to === 'xlsx' ? ', which has no ' : ', which have no ';
      return loss.functions.length > 0 ? `${what}${why}${named(loss.functions, 'or')}` : what;
    }
    case 'formula_unwritten':
      return one
        ? '1 formula is written as its value only'
        : `${loss.count} formulas are written as their values only`;
    case 'text_cut':
      return `${one ? '1 cell’s' : `${loss.count} cells’`} text is cut to Excel’s 32,767 characters`;
    case 'columns_cut':
      return `Columns past XFD are left out of ${one ? '1 sheet' : `${loss.count} sheets`}: ${named(loss.sheets, 'and')}`;
  }
}

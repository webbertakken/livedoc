// The conversion dialog's words (docs/specs/029-sheets/files-and-print.md "Converting", D88): its title, and one line
// a loss, counted, naming up to three sheets or functions. Pure, so every line is tested without React.
import type { WorkbookFormat } from '../workbook-record';
import type { ConversionLoss } from './conversion';
import type { KeptKind } from './kept-content';
import type { SimplifiedFeature } from './file-validation';

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

// What a person calls each kind of kept content (standard-mapping.md "Unknown content").
const KEPT_KIND: Record<KeptKind, string> = {
  drawings: 'drawings',
  notes: 'notes',
  'named-ranges': 'named ranges',
  validation: 'data validation',
  'format-rules': 'conditional formatting',
  filters: 'filters',
  merges: 'merged cells',
  'pivot-tables': 'pivot tables',
  tables: 'tables',
  links: 'links',
  'print-settings': 'print settings',
  protection: 'protection',
  'column-widths': 'column widths',
  'view-settings': 'view settings',
  other: 'other content',
};

// What a person calls what another app loses of a validation rule.
const SIMPLIFIED_WORDS: Record<SimplifiedFeature, string> = {
  colours: 'option colours',
  chips: 'chips and arrows',
  multi: 'multiple selections',
  checkboxes: 'checkboxes',
};

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
    case 'answers_differ': {
      const what = one ? '1 formula may answer' : `${loss.count} formulas may answer`;
      return `${what} differently in ${FORMAT_NAME[to]}: ${named(loss.functions, 'and')}`;
    }
    case 'validation_simplified': {
      const what = one
        ? '1 data validation rule works'
        : `${loss.count} data validation rules work`;
      const where = to === 'xlsx' ? 'Excel' : 'other apps';
      // Every one named: there are at most four.
      const words = loss.features.map((f) => SIMPLIFIED_WORDS[f]);
      const list =
        words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)!}` : words[0]!;
      return `${what} more simply in ${where}: ${list}`;
    }
    // The kept content stays with the spreadsheet in its own format, so it is the other format's file's (D109).
    case 'kept': {
      const from = to === 'xlsx' ? 'OpenDocument' : 'Excel';
      const what = one ? '1 thing' : `${loss.count} things`;
      const stay = one ? 'stays' : 'stay';
      return `${what} kept from the ${from} file ${stay} behind: ${named(
        loss.kinds.map((k) => KEPT_KIND[k]),
        'and',
      )}`;
    }
  }
}

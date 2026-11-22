// What the import report says (docs/specs/029-sheets/files-and-print.md "The import report", D120): a line a kind,
// counted, naming up to three; the words a person reads for each of the read's losses.
import { FILE_READ_CELLS_MAX, WORKBOOK_INPUT_MAX, WORKBOOK_SHEETS_MAX } from '@livedoc/sheets';
import type { ReportedLoss, SheetRename } from '@livedoc/sheets/files';

export const IMPORT_REPORT_LEAD = 'Some of what the file holds is not in the spreadsheet:';

/** The report's title: the file opened, by the spreadsheet's name. */
export const importReportTitle = (name: string): string => `Opened “${name}”`;

const counted = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`;
const verb = (count: number, one: string, many: string) => (count === 1 ? one : many);

// Names as a sentence lists them; a count past them says there are more.
function listed(names: readonly string[], count: number): string {
  const all = count > names.length ? [...names, 'more'] : [...names];
  return all.length < 2 ? all.join('') : `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`;
}

// A line, with its names after a colon when it has any.
const named = (text: string, loss: { count: number; names: readonly string[] }) =>
  loss.names.length > 0 ? `${text}: ${listed(loss.names, loss.count)}` : text;

const renamed = (names: readonly SheetRename[]) =>
  names.map(({ from, to }) => `“${from}” becomes “${to}”`).join(', ');

/** One line of the report. */
export function importReportLine(loss: ReportedLoss): string {
  const { count } = loss;
  switch (loss.k) {
    case 'sheets_cut':
      return `${counted(count, 'sheet', 'sheets')} past the ${WORKBOOK_SHEETS_MAX}th ${verb(count, 'is', 'are')} left out`;
    case 'sheet_unread':
      return named(`${counted(count, 'chart sheet is', 'chart sheets are')} left out`, loss);
    case 'sheet_cut':
      return named(
        `${counted(count, 'sheet is', 'sheets are')} cut to the spreadsheet’s limits`,
        loss,
      );
    case 'cells_cut':
      return named(
        `Cells past the first ${FILE_READ_CELLS_MAX.toLocaleString('en-GB')} are left out of ${counted(count, 'sheet', 'sheets')}`,
        loss,
      );
    case 'formula_unread':
      return named(
        `${counted(count, 'formula', 'formulas')} LiveDoc cannot read ${verb(count, 'keeps only its last value', 'keep only their last values')}`,
        loss,
      );
    case 'formula_unwritten':
      return named(`${counted(count, 'formula is', 'formulas are')} written as values only`, loss);
    case 'text_cut':
      return `${counted(count, 'cell’s', 'cells’')} text is cut to ${WORKBOOK_INPUT_MAX.toLocaleString('en-GB')} characters`;
    case 'macros':
      return 'The file’s macros are removed and never run';
    case 'signature':
      return 'The file’s digital signature is removed, as LiveDoc changes what it signed';
    case 'objects':
      return `${counted(count, 'embedded object is', 'embedded objects are')} left out`;
    case 'kept':
      return `${counted(count, 'thing', 'things')} the file holds could not be kept`;
    case 'answers_differ':
      return named(`${counted(count, 'formula', 'formulas')} may answer differently`, loss);
    case 'format_unread':
      return named(
        `${counted(count, 'number format', 'number formats')} LiveDoc cannot read ${verb(count, 'is', 'are')} left out`,
        loss,
      );
    case 'format_unwritten':
      return named(
        `${counted(count, 'number format is', 'number formats are')} left out of the file`,
        loss,
      );
    case 'format_approximated':
      return named(
        `${counted(count, 'number format is', 'number formats are')} shown as near as LiveDoc can`,
        loss,
      );
    case 'formats_cut':
      return named(
        `Formats over long runs of empty cells are left out of ${counted(count, 'sheet', 'sheets')}`,
        loss,
      );
    case 'styles_unread':
      return named(
        `Fonts, fills, borders and alignment are not shown yet in ${counted(count, 'sheet', 'sheets')}`,
        loss,
      );
    case 'sizes_unread':
      return named(
        `Row heights and column widths are not read yet in ${counted(count, 'sheet', 'sheets')}`,
        loss,
      );
    case 'sheet_renamed':
      return `${counted(count, 'sheet name is', 'sheet names are')} changed to fit: ${renamed(loss.names)}`;
  }
}

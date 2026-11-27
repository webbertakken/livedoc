// What the import report says (docs/specs/029-sheets/files-and-print.md "The import report", D120): a line a kind,
// counted, naming up to three; the words a person reads for each of the read's losses.
import { WORKBOOK_INPUT_MAX, WORKBOOK_SHEETS_MAX } from '../workbook/workbook-limits';
import { PROTECTION_EXCEPTIONS_MAX } from '../protection';
import { FILE_READ_CELLS_MAX } from './file-read-limits';
import type { FileOpenRejection } from './import-file';
import type { ReportedLoss, SheetRename } from './import-report';

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
    case 'name_unread':
      return named(
        `${counted(count, 'named range', 'named ranges')} LiveDoc cannot read ${verb(count, 'is', 'are')} kept for the file`,
        loss,
      );
    case 'table_unread':
      return named(
        `${counted(count, 'table', 'tables')} LiveDoc cannot read ${verb(count, 'stays plain cells', 'stay plain cells')}`,
        loss,
      );
    case 'function_unread':
      return named(
        `${counted(count, 'named function', 'named functions')} LiveDoc cannot read ${verb(count, 'is', 'are')} kept for Excel`,
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
        `Rotation, indents, patterned fills and other styling are left out of ${counted(count, 'sheet', 'sheets')}`,
        loss,
      );
    case 'format_rule_unread':
      return named(
        `${counted(count, 'conditional formatting rule', 'conditional formatting rules')} LiveDoc cannot read ${verb(count, 'is', 'are')} left out`,
        loss,
      );
    case 'validation_rule_unread':
      return named(
        `${counted(count, 'data validation rule', 'data validation rules')} LiveDoc cannot read ${verb(count, 'is', 'are')} left out`,
        loss,
      );
    case 'protection_cut':
      return named(
        `${counted(count, 'protected sheet frees', 'protected sheets free')} more than ${PROTECTION_EXCEPTIONS_MAX} ranges; the rest stay protected`,
        loss,
      );
    case 'sizes_cut':
      return named(
        `Row heights and column widths past the most a sheet holds are left out of ${counted(count, 'sheet', 'sheets')}`,
        loss,
      );
    case 'charts_unwritten':
      return named(
        `Charts are left out of ${counted(count, 'sheet', 'sheets')} that keep the file's own drawings`,
        loss,
      );
    case 'chart_rewritten':
      return named(
        `${counted(count, 'chart changed since the file was opened is', 'charts changed since the file was opened are')} written as LiveDoc draws charts`,
        // Its names are the sheets, not the charts it counts.
        { ...loss, count: loss.names.length },
      );
    case 'chart_nearest_type':
      return named(
        `${counted(count, 'chart of a type the format does not hold is', 'charts of types the format does not hold are')} written as the nearest type it does, and read back by LiveDoc as made`,
        // Its names are the sheets, not the charts it counts.
        { ...loss, count: loss.names.length },
      );
    case 'pivot_unwritten':
      return named(
        `${counted(count, 'pivot table whose source data was deleted is', 'pivot tables whose source data was deleted are')} left out`,
        { ...loss, count: loss.names.length },
      );
    case 'pivot_unread':
      return named(
        `${counted(count, 'pivot table LiveDoc cannot work out is', 'pivot tables LiveDoc cannot work out are')} kept as the file holds them`,
        { ...loss, count: loss.names.length },
      );
    case 'sheet_renamed':
      return `${counted(count, 'sheet name is', 'sheet names are')} changed to fit: ${renamed(loss.names)}`;
  }
}

// What each refusal of a file says (docs/specs/020-import-export/office-packages.md "Named rejections").
const FILE_OPEN_REFUSAL_WORDS: Record<FileOpenRejection, string> = {
  package_damaged: 'This file is damaged and could not be opened.',
  package_too_large: 'This file is too large to open.',
  picture_too_large: 'This file holds a picture too large to open.',
  document_too_large: 'This file is too large to open.',
  package_encrypted:
    'This file is protected by a password. Remove the password, then open it again.',
  package_wrong_type: 'This file is not a spreadsheet LiveDoc can open yet.',
  xml_doctype_refused: 'This file holds content LiveDoc never opens.',
  xml_malformed: 'This file is damaged and could not be opened.',
  no_sheets: 'This file holds no sheets to open.',
  import_refused: 'The file could not be opened. Try again.',
};

/** The words a person reads for a file that did not open. */
export const fileOpenRefusalWords = (rejection: FileOpenRejection): string =>
  FILE_OPEN_REFUSAL_WORDS[rejection];

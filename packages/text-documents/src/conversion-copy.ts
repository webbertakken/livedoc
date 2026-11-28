// The conversion dialog's words (docs/specs/034-text-documents/standard-mapping.md "Conversion", files-and-print.md
// "Downloading"): its title, its lead, and one line a kind of loss, counted. Kept content is one line naming up to
// three of what was kept. Pure, so every line is tested without React.
import type { ConversionLoss } from './convert';
import type { TextDocumentFormat } from './model/text-document';
import { conversionRecordOf, type ReportEntry } from './report-record';

/** Why the dialog opened: to change the document's format, or to download a converted copy. */
export type ConversionPurpose = 'convert' | 'download';

/** The names the kept line shows before it counts the rest. */
export const CONVERSION_NAMES_SHOWN = 3;

const FORMAT_NAME: Record<TextDocumentFormat, string> = { odf: 'OpenDocument', ooxml: 'Word' };
const FILE_TYPE: Record<TextDocumentFormat, string> = { odf: 'odt', ooxml: 'docx' };

export const formatName = (format: TextDocumentFormat): string => FORMAT_NAME[format];

export function conversionTitle(purpose: ConversionPurpose, to: TextDocumentFormat): string {
  return `${purpose === 'convert' ? 'Convert to' : 'Download as'} ${FORMAT_NAME[to]}?`;
}

/** The line above the losses, or the whole message when there are none. */
export function conversionLead(to: TextDocumentFormat, losses: readonly ConversionLoss[]): string {
  return losses.length > 0
    ? `The .${FILE_TYPE[to]} file cannot hold:`
    : `Everything in this document fits the ${FORMAT_NAME[to]} format.`;
}

type OtherKind = Exclude<ConversionLoss['kind'], 'kept'>;

/** Each loss other than kept content: what one of it is called, and what more than one are. */
export const CONVERSION_LINES: Record<OtherKind, readonly [one: string, many: string]> = {
  'text-transform': [
    'run of lowercase or capitalised text',
    'runs of lowercase or capitalised text',
  ],
  'section-name': ['section name and its protection', 'section names and their protection'],
  'list-header': ['list paragraph without a number', 'list paragraphs without a number'],
  between: ['line between paragraphs', 'lines between paragraphs'],
  'border-padding': [
    'border with padding past 31 pt, written as 31 pt',
    'borders with padding past 31 pt, written as 31 pt',
  ],
  'header-footer': [
    'header or footer of a continuous section',
    'headers and footers of continuous sections',
  ],
  'page-number-start': [
    'page number starting anew in a continuous section',
    'page numbers starting anew in continuous sections',
  ],
  'line-number-restart': [
    'section restarting line numbers unlike the first',
    'sections restarting line numbers unlike the first',
  ],
  'table-style': ['table style from the original file', 'table styles from the original file'],
};

/** A count with its noun: "1 macro", "3 macros". */
export const counted = (count: number, [one, many]: readonly [string, string]) =>
  `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`;

/** Up to three names, then how many more of `nameCount` there were: "A, B and C", "A, B, C and 2 more". */
export function named(names: readonly string[], nameCount = names.length): string {
  const shown = names.slice(0, CONVERSION_NAMES_SHOWN);
  const rest = Math.max(nameCount, shown.length) - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  if (shown.length === 1) return shown[0]!;
  return `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)!}`;
}

/** The kept line: how many items, and the first of their names. */
export const keptLine = (kept: ReportEntry, from: string): string =>
  `${counted(kept.count, ['item', 'items'])} kept ${from}: ${named(kept.names, kept.nameCount)}`;

/** One line a kind of loss as the report keeps them: kept content first, then the rest in the order they came. */
export function conversionLinesOf(
  entries: readonly ReportEntry<ConversionLoss['kind']>[],
): string[] {
  const kept = entries.find((e) => e.reason === 'kept');
  return [
    ...(kept ? [keptLine(kept, 'from the original file')] : []),
    ...entries.flatMap((e) =>
      e.reason === 'kept' ? [] : [counted(e.count, CONVERSION_LINES[e.reason])],
    ),
  ];
}

/** One line a kind of loss: kept content first, as one line, then the rest in the order they came. */
export function conversionLines(losses: readonly ConversionLoss[]): string[] {
  return conversionLinesOf(conversionRecordOf('odf', 'ooxml', losses)?.losses ?? []);
}

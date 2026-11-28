// The import report's words (docs/specs/034-text-documents/files-and-print.md "Import report"): a line a kind of thing
// a read dropped or kept, counted, naming the first few where their names mean something; and each conversion's
// lines as its dialog listed them. Pure, so every line is tested without React.
import { conversionLinesOf, counted, formatName, keptLine, named } from './conversion-copy';
import type { DroppedReason } from './report';
import type { ConversionRecord, ImportRecord, ReportEntry } from './report-record';

/** What one of each dropped kind is called, and what more than one are, with what became of them. */
export const REPORT_LINES: Record<DroppedReason, readonly [one: string, many: string]> = {
  macro: ['macro left out, never run', 'macros left out, never run'],
  signature: ['digital signature left out', 'digital signatures left out'],
  thumbnail: ['thumbnail picture left out', 'thumbnail pictures left out'],
  'ole-object': ['embedded object left out', 'embedded objects left out'],
  'picture-format': [
    'picture in a format LiveDoc does not draw left out',
    'pictures in formats LiveDoc does not draw left out',
  ],
  'active-content': [
    'script, frame or control left out, never run',
    'scripts, frames or controls left out, never run',
  ],
  field: [
    'field that runs or fetches things kept as its text',
    'fields that run or fetch things kept as their text',
  ],
  link: ['unsafe link kept as its text', 'unsafe links kept as their text'],
  external: [
    'external link or remote picture not followed',
    'external links or remote pictures not followed',
  ],
  'kept-limit': [
    'item of kept content past the size limit left out',
    'items of kept content past the size limit left out',
  ],
  'layout-hint': [
    'layout hint left out (LiveDoc lays out the pages itself)',
    'layout hints left out (LiveDoc lays out the pages itself)',
  ],
  'tab-stop': [
    'tab stop LiveDoc does not hold left out',
    'tab stops LiveDoc does not hold left out',
  ],
  'column-width': ['set of unequal columns made equal', 'sets of unequal columns made equal'],
  'header-footer': [
    'header or footer LiveDoc does not hold left out',
    'headers or footers LiveDoc does not hold left out',
  ],
  'table-content': [
    'part of a table LiveDoc does not hold left out',
    'parts of tables LiveDoc does not hold left out',
  ],
  'table-repaired': ['damaged table repaired', 'damaged tables repaired'],
  'comment-unpaired': [
    'comment whose place was not found left out',
    'comments whose places were not found left out',
  ],
  'comment-in-story': [
    'comment in a header, footer or note left out',
    'comments in headers, footers or notes left out',
  ],
  'suggestion-dangling': [
    'suggestion whose change was not found left out',
    'suggestions whose changes were not found left out',
  ],
  'suggestion-last-mark': [
    "suggested change to the last paragraph's end left out",
    "suggested changes to last paragraphs' ends left out",
  ],
  'suggestion-paragraphs': [
    'suggested deletion across paragraphs read as one paragraph',
    'suggested deletions across paragraphs read as one paragraph each',
  ],
  'suggestion-unknown': [
    'suggestion of a kind LiveDoc does not hold left out',
    'suggestions of kinds LiveDoc does not hold left out',
  ],
};

/** The reasons whose names tell a reader something (a macro's part, a field's kind, an element's name). */
export const NAMED_REASONS: ReadonlySet<DroppedReason> = new Set<DroppedReason>([
  'macro',
  'picture-format',
  'active-content',
  'field',
  'external',
  'header-footer',
  'table-content',
  'table-repaired',
  'layout-hint',
  'suggestion-unknown',
]);

export const SECURITY_LIMITATIONS_TITLE = 'Security limitations';
export const OPENED_LEAD = 'Some of what the file held is not in the document:';
export const REPORT_EMPTY =
  'Nothing was left out or kept aside when this document was opened or converted.';

/** The once-shown report's title: the file opened, by the document's name. */
export const openedTitle = (name: string): string => `Opened “${name}”`;

/** The Opened section's heading in Security limitations. */
export const openedHeading = (record: ImportRecord): string => `Opened from a .${record.type} file`;

/** A Converted entry's heading. */
export const convertedHeading = (record: ConversionRecord): string =>
  `Converted to ${formatName(record.to)}`;

function droppedLine(entry: ReportEntry<DroppedReason>): string {
  const line = counted(entry.count, REPORT_LINES[entry.reason]);
  return NAMED_REASONS.has(entry.reason) ? `${line}: ${named(entry.names, entry.nameCount)}` : line;
}

/** The Opened lines: kept content first, then each kind dropped in the order it came. */
export const openedLines = (record: ImportRecord): string[] => [
  ...(record.kept ? [keptLine(record.kept, 'untouched from the file')] : []),
  ...record.dropped.map(droppedLine),
];

/** A conversion's lines, as its dialog listed them. */
export const convertedLines = (record: ConversionRecord): string[] =>
  conversionLinesOf(record.losses);

// The names the content summaries' refresh records a difference under (docs/specs/006-document/document-storage.md
// "Refreshing the summaries", What changed). Imports nothing, so the operator's script reads them without the api's types.
/** Every name a difference is recorded under, in the order it is listed. */
export const SUMMARY_FIELDS = [
  'missing',
  'unparseable',
  'v',
  'tabs',
  'firstTabCount',
  'tabCounts',
  'stats',
  'stats.mode',
  'stats.elements',
  'stats.comments',
  'stats.bytes',
  'hasContent',
  'spreadsheet',
  'textDocument',
  'order',
  'other',
] as const;
export type SummaryField = (typeof SUMMARY_FIELDS)[number];

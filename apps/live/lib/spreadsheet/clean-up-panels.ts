// Column Stats' and Clean-up Suggestions' words (docs/specs/029-sheets/data-tools.md "Column Stats", "Clean-up
// Suggestions"): what each suggestion card says, and how a figure reads. The figures are the engine's.
import { columnLetters, formatRange, type CleanUpSuggestion } from '@livedoc/sheets';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const NO_SUGGESTIONS = 'No suggestions right now. Your data looks clean.';
export const EMPTY_COLUMN = 'This column is empty.';

export function suggestionTitle(s: CleanUpSuggestion): string {
  if (s.kind === 'duplicates') return 'Remove duplicates';
  if (s.kind === 'spaces') return 'Trim whitespace';
  return 'Inconsistent number format';
}

export function suggestionLine(s: CleanUpSuggestion): string {
  if (s.kind === 'duplicates')
    return `${plural(s.count, 'duplicate row')} in ${formatRange(s.range)}`;
  if (s.kind === 'spaces')
    return `${plural(s.count, 'cell')} with extra spaces in ${formatRange(s.range)}`;
  return `${plural(s.count, 'number')} stored as text in column ${columnLetters(s.col)}`;
}

// A figure as the panel shows it: grouped, up to two decimals, in the workbook's locale.
export function statFigure(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
}

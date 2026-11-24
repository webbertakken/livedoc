// The Custom Number Formats dialog's workings (docs/specs/029-sheets/formatting.md "Number formats", D193): where its
// code starts, what its preview draws, and Google's examples. Pure.
import { formatCodeDraw, formatCodeProblem, type CellFormat, type Value } from '@livedoc/sheets';
import { formatCodeOf } from '@livedoc/sheets/files';

/** What a new code starts as, and what the preview draws without a number or text in the cell. */
export const CUSTOM_FORMAT_DEFAULT = '#,##0.00';
export const CUSTOM_FORMAT_SAMPLE = 1234.5;

/** The dialog's examples, in order (D193). */
export const CUSTOM_FORMAT_EXAMPLES: readonly string[] = [
  '0.00',
  '#,##0',
  '#,##0.00',
  '0%',
  '0.00%',
  '0.00E+00',
  '£#,##0.00',
  '#,##0.00;[Red]-#,##0.00',
  '#,##0.00;(#,##0.00)',
  '[<1000]0;[<1000000]0.0,"K";0.0,,"M"',
  'dd/mm/yyyy',
  'hh:mm',
  '[h]:mm:ss',
  '"Total: "@',
];

/** The active cell's code: its own when Custom, its format's otherwise, the default for Automatic. */
export function customFormatStart(format: CellFormat | undefined, locale: string): string {
  return formatCodeOf(format, locale) ?? CUSTOM_FORMAT_DEFAULT;
}

export type CustomFormatPreview =
  { ok: true; text: string; colour?: string } | { ok: false; problem: string };

/** The value drawn in the code (the sample for anything not a number or text), or why the code cannot be read. */
export function customFormatPreview(value: Value, code: string): CustomFormatPreview {
  const problem = formatCodeProblem(code);
  if (problem) return { ok: false, problem };
  const shown =
    typeof value === 'number' || typeof value === 'string' ? value : CUSTOM_FORMAT_SAMPLE;
  return { ok: true, ...formatCodeDraw(shown, code) };
}

// The text an edit of a cell starts from (docs/specs/029-sheets/formulas.md "What a typed input becomes"): its input
// as typed, a number in a Date format as that date in the locale's short form when the date reads back as the same
// number, never its serial number. Find and Replace changes this text (data-tools.md "Find and replace", D455).
import { displayValue } from './number-format';
import { inputAsText, readTypedInput } from './typed-input';
import type { SheetsCtx } from './formula/stored';
import type { Cell } from './sheet';

export function cellEditText(cell: Cell | undefined, ctx: SheetsCtx, locale: string): string {
  const input = cell?.input;
  if (input && 'n' in input && cell?.format?.nf === 'date') {
    const date = displayValue(input.n, { nf: 'date' }, locale).text;
    const back = readTypedInput(date, locale, ctx);
    if (back.kind === 'value' && 'n' in back.input && back.input.n === input.n) return date;
  }
  return inputAsText(input, ctx, locale);
}

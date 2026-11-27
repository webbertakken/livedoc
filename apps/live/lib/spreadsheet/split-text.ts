// Data › Split Text to Columns' words and choices (docs/specs/029-sheets/data-tools.md "Split Text to Columns"): the
// Separator chip's options, and what a refused split says. The split itself is the engine's (`splitTextToColumns`).
import type { SplitSeparator } from '@livedoc/sheets';

export type SeparatorChoice = SplitSeparator['kind'];

export const SEPARATOR_CHOICES: readonly { kind: SeparatorChoice; label: string }[] = [
  { kind: 'detect', label: 'Detect Automatically' },
  { kind: 'comma', label: 'Comma' },
  { kind: 'semicolon', label: 'Semicolon' },
  { kind: 'period', label: 'Period' },
  { kind: 'space', label: 'Space' },
  { kind: 'custom', label: 'Custom' },
];

export const SPLIT_REFUSED: Record<'columns' | 'full', string> = {
  columns: 'You cannot split data that spans more than one column.',
  full: 'There is not enough room to split this data.',
};

export const REPLACE_DATA_LINE = 'Splitting will replace data in the cells to the right.';

// The separator a choice makes, a custom one with its text (none yet: nothing to split by).
export function separatorOf(kind: SeparatorChoice, custom: string): SplitSeparator | null {
  if (kind !== 'custom') return { kind };
  return custom ? { kind, text: custom } : null;
}

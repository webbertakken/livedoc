// The Number menu's recently used formats (docs/specs/029-sheets/formatting.md "Number formats", D194): the Custom
// codes the open sheet's cells hold, the most cells first, ties by the first seen. Nothing new is saved for them.
import type { Cell } from '@livedoc/sheets';

export const RECENT_FORMATS_MAX = 5;

/** The codes, ranked, at most RECENT_FORMATS_MAX. */
export function recentFormatCodes(cells: Iterable<Cell>): string[] {
  const counts = new Map<string, number>();
  for (const cell of cells) {
    const code = cell.format?.nf === 'custom' ? cell.format.nc : undefined;
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  // A Map keeps its first-seen order, and the sort is stable: ties stay in it.
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, RECENT_FORMATS_MAX)
    .map(([code]) => code);
}

/** A recently used item's id, by its place in the list. */
export const recentFormatItemId = (index: number): string => `number-recent-${index}`;

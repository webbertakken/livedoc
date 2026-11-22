// The sheet bar's summary of a selection (docs/specs/029-sheets/surface.md "Sheet bar"): Google's six kinds, each
// value from the selection's counts, and the one the bar shows for the person's pick (D132).
import type { SelectionStats } from '@/components/sheets/selection-stats';

export const SUMMARY_KINDS = ['Sum', 'Average', 'Min', 'Max', 'Count', 'Count Numbers'] as const;
export type SummaryKind = (typeof SUMMARY_KINDS)[number];

/** A kind's value over the counts; null where it has none (an average, a least or a most of no number). */
export function summaryValue(kind: SummaryKind, stats: SelectionStats): number | null {
  if (kind === 'Count') return stats.count;
  if (kind === 'Count Numbers') return stats.numbers;
  if (kind === 'Sum') return stats.sum;
  if (stats.numbers === 0) return null;
  if (kind === 'Average') return stats.sum / stats.numbers;
  return kind === 'Min' ? stats.min : stats.max;
}

/** The kind the bar shows: the pick, or Count where no number is selected (D132). */
export function summaryShown(pick: SummaryKind, stats: SelectionStats): SummaryKind {
  return stats.numbers === 0 ? 'Count' : pick;
}

/** Whether a kind's value is a count, written as a whole number rather than in the cells' format. */
export const isCountKind = (kind: SummaryKind): boolean =>
  kind === 'Count' || kind === 'Count Numbers';

// Data › Column Stats (docs/specs/029-sheets/data-tools.md "Column Stats", D465): a column's figures as its cells show
// them, from below the rows it ignores to the sheet's last filled row. Pure: reads the workbook, changes nothing.
import type { Workbook } from '../engine/workbook';
import { scalarOf } from '../formula/values';
import { displayValue } from '../number-format';
import { cellKey } from '../sheet';
import { duplicateKey } from './remove-duplicates';

// Up to 10 bars (the rest `Other`), 10 histogram bins, 20 frequent values (D465).
export const STATS_BARS = 10;
export const STATS_BINS = 10;
export const STATS_FREQUENT = 20;

export type StatsValue = { text: string; count: number };
export type StatsBin = { from: number; to: number; count: number };

export type ColumnStats = {
  count: number;
  empty: number;
  unique: number;
  // Over the column's numbers only; null with none.
  numbers: { sum: number; average: number; median: number; min: number; max: number } | null;
  // More than half the filled cells numbers: the chart is a histogram.
  mostlyNumbers: boolean;
  // Every value shown and how often, most frequent first (first seen first among equals).
  frequency: StatsValue[];
  histogram: StatsBin[] | null;
};

function median(sorted: readonly number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function bins(numbers: readonly number[], count = STATS_BINS): StatsBin[] {
  let min = Infinity;
  let max = -Infinity;
  for (const n of numbers) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  if (!numbers.length) return [];
  if (min === max) return [{ from: min, to: max, count: numbers.length }];
  const step = (max - min) / count;
  const out = Array.from({ length: count }, (_, i) => ({
    from: min + step * i,
    to: i === count - 1 ? max : min + step * (i + 1),
    count: 0,
  }));
  for (const n of numbers) out[Math.min(count - 1, Math.floor((n - min) / step))]!.count++;
  return out;
}

export function columnStats(
  wb: Workbook,
  sheetId: string,
  col: number,
  ignoreRows: number,
): ColumnStats | null {
  const sheet = wb.sheet(sheetId);
  const colId = sheet?.layout.cols[col];
  if (!sheet || colId === undefined) return null;
  const last = wb.extent(sheetId).rows;
  let empty = 0;
  const numbers: number[] = [];
  const counts = new Map<string, StatsValue>();
  for (let r = ignoreRows; r < last; r++) {
    const value = scalarOf(wb.value(sheetId, r, col));
    if (value === null || value === '') {
      empty++;
      continue;
    }
    if (typeof value === 'number') numbers.push(value);
    const key = duplicateKey(value);
    const seen = counts.get(key);
    if (seen) seen.count++;
    else {
      const format = sheet.cells.get(cellKey(sheet.layout.rows[r]!, colId))?.format;
      counts.set(key, { text: displayValue(value, format, wb.locale).text, count: 1 });
    }
  }
  const filled = [...counts.values()].reduce((n, v) => n + v.count, 0);
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = numbers.reduce((a, b) => a + b, 0);
  const mostlyNumbers = numbers.length * 2 > filled;
  return {
    count: filled,
    empty,
    unique: counts.size,
    numbers: numbers.length
      ? {
          sum,
          average: sum / numbers.length,
          median: median(sorted),
          min: sorted[0]!,
          max: sorted[sorted.length - 1]!,
        }
      : null,
    mostlyNumbers,
    frequency: [...counts.values()].sort((a, b) => b.count - a.count),
    histogram: mostlyNumbers ? bins(numbers) : null,
  };
}

// The bar chart's bars: the most frequent values, the rest summed as `Other`.
export function statsBars(frequency: readonly StatsValue[], bars = STATS_BARS): StatsValue[] {
  if (frequency.length <= bars) return [...frequency];
  const rest = frequency.slice(bars - 1).reduce((n, v) => n + v.count, 0);
  return [...frequency.slice(0, bars - 1), { text: 'Other', count: rest }];
}

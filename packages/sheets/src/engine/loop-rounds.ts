// Iterative calculation's rounds (docs/specs/029-sheets/formulas.md "Recalculation", settings.md "Calculation"): a
// loop worked out again and again, each round reading the round before's values, until they settle or the rounds run
// out; and what each loop cell last settled to, so the next recalculation starts from it (D35).
import type { Value } from '../formula/values';
import type { CellNo } from './cell-numbers';
import type { Iteration } from './loops';

/** What the rounds need of the workbook. */
export type LoopCells = {
  value(no: CellNo): Value | undefined;
  // Forget a cell's value (and its spill), so the next read works it out.
  forget(no: CellNo): void;
  compute(no: CellNo): void;
  // A cell's lasting id, which outlives its number.
  idOf(no: CellNo): string;
};

export class LoopRounds {
  private readonly iterating = new Set<CellNo>();
  private readonly seeds = new Map<CellNo, Value>();
  // By cell id: what each loop cell last settled to.
  private readonly settledTo = new Map<string, Value>();

  /** Whether a cell's loop is in a round now. */
  isIterating(no: CellNo): boolean {
    return this.iterating.has(no);
  }

  /** What a read back to a loop cell gives: the round before's value, else what it last settled to, else empty. */
  seedOf(no: CellNo, cells: LoopCells): Value {
    const seed = this.seeds.get(no);
    if (seed !== undefined) return seed;
    return this.settledTo.size > 0 ? (this.settledTo.get(cells.idOf(no)) ?? null) : null;
  }

  /** A cell was retyped: its loop starts afresh. */
  retyped(id: string): void {
    if (this.settledTo.size > 0) this.settledTo.delete(id);
  }

  /** The rounds after the first (its values already worked out), the loop's first cell first; how many ran. */
  run(loop: readonly CellNo[], iteration: Iteration, cells: LoopCells): number {
    let before = loop.map((no) => cells.value(no) ?? null);
    let rounds = 1;
    for (const no of loop) this.iterating.add(no);
    try {
      while (rounds < iteration.max) {
        rounds++;
        loop.forEach((no, i) => {
          this.seeds.set(no, before[i]!);
          cells.forget(no);
        });
        for (const no of loop) cells.compute(no);
        const after = loop.map((no) => cells.value(no) ?? null);
        const done = settled(before, after, iteration.threshold);
        before = after;
        if (done) break;
      }
    } catch (e) {
      // Cut off (a read restarted): no round's values are kept.
      for (const no of loop) cells.forget(no);
      throw e;
    } finally {
      for (const no of loop) {
        this.iterating.delete(no);
        this.seeds.delete(no);
      }
    }
    loop.forEach((no, i) => this.settledTo.set(cells.idOf(no), before[i]!));
    return rounds;
  }
}

/** Whether a loop's values settled: each moved by less than the threshold since the round before (or not at all). */
export function settled(
  before: readonly Value[],
  after: readonly Value[],
  threshold: number,
): boolean {
  return before.every((b, i) => sameWithin(b, after[i]!, threshold));
}

function sameWithin(a: Value, b: Value, threshold: number): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b || Math.abs(a - b) < threshold;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if ('e' in a || 'e' in b) return 'e' in a && 'e' in b && a.e === b.e;
  if (a.rows.length !== b.rows.length) return false;
  return a.rows.every(
    (row, i) =>
      row.length === b.rows[i]!.length &&
      row.every((v, j) => sameWithin(v, b.rows[i]![j]!, threshold)),
  );
}

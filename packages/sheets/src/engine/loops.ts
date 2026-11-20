// Circular references found whole (docs/specs/029-sheets/formulas.md "Recalculation"): Tarjan's strongly connected
// components, kept as the workbook works formulas out, reads being the edges. A formula that reads a formula being
// worked out, or one finished but waiting on its loop, joins that loop; the loop is known once the first of its
// cells to start finishes, so every cell of it is told the same, whichever was read first.
import type { CellNo } from './cell-numbers';

/** Iterative calculation (settings.md "Calculation"): off, or on with its most rounds and threshold. */
export type Iteration = { readonly on: boolean; readonly max: number; readonly threshold: number };

export const ITERATION_OFF: Iteration = { on: false, max: 50, threshold: 0.05 };

export function sameIteration(a: Iteration, b: Iteration): boolean {
  return a.on === b.on && a.max === b.max && a.threshold === b.threshold;
}

export class Loops {
  private visits = 0;
  // The formulas being worked out, innermost last: each one's cell, visit number, and the lowest visit it reaches.
  private readonly frameCells: CellNo[] = [];
  private readonly frameVisits: number[] = [];
  private readonly lows: number[] = [];
  // Finished formulas waiting on their loop, in the order they finished, and each one's visit number.
  private readonly waiting: CellNo[] = [];
  private readonly waitingVisit = new Map<CellNo, number>();
  // Formulas found reading themselves.
  private readonly selfReaders = new Set<CellNo>();

  /** A formula starts being worked out; its visit number. */
  enter(no: CellNo): number {
    const visit = ++this.visits;
    this.frameCells.push(no);
    this.frameVisits.push(visit);
    this.lows.push(visit);
    return visit;
  }

  /** Whether a formula is finished but waiting on its loop. */
  isWaiting(no: CellNo): boolean {
    return this.waitingVisit.size > 0 && this.waitingVisit.has(no);
  }

  /** The formula being worked out read `no`, which is being worked out too or waiting on its loop. */
  readBack(no: CellNo): void {
    const top = this.lows.length - 1;
    if (top < 0) return;
    let visit = this.waitingVisit.get(no);
    if (visit === undefined) {
      // Being worked out: a loop is rare, so its frame is looked for only now.
      const at = this.frameCells.lastIndexOf(no);
      if (at < 0) return;
      visit = this.frameVisits[at]!;
      if (at === top) this.selfReaders.add(no);
    }
    if (visit < this.lows[top]!) this.lows[top] = visit;
  }

  /**
   * A formula finished being worked out. Null when it waits on a loop still open; else the loop it closes, its first
   * cell first (empty when it is in none).
   */
  leave(no: CellNo, visit: number): CellNo[] | null {
    const low = this.lows.pop()!;
    this.frameCells.pop();
    this.frameVisits.pop();
    if (low < visit) {
      this.waiting.push(no);
      this.waitingVisit.set(no, visit);
      const top = this.lows.length - 1;
      if (top >= 0 && low < this.lows[top]!) this.lows[top] = low;
      return null;
    }
    if (this.waiting.length === 0 && this.selfReaders.size === 0) return [];
    let from = this.waiting.length;
    while (from > 0 && this.waitingVisit.get(this.waiting[from - 1]!)! > visit) from--;
    const members = this.waiting.splice(from);
    for (const m of members) {
      this.waitingVisit.delete(m);
      this.selfReaders.delete(m);
    }
    const self = this.selfReaders.delete(no);
    return members.length > 0 || self ? [no, ...members] : [];
  }

  /** A formula's work was cut off (a read restarted): forget every open frame; the cells waiting, to forget. */
  abandon(): CellNo[] {
    const waiting = this.waiting.splice(0);
    this.waitingVisit.clear();
    this.frameCells.length = 0;
    this.frameVisits.length = 0;
    this.lows.length = 0;
    this.selfReaders.clear();
    return waiting;
  }
}

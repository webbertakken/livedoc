// The page's copy of a Web Worker's values (formulas.md "Recalculation"): a Workbook that never works a formula out.
// Values arrive by acceptValue; until then a changed cell keeps its last value, shown faded (stale).
import { layoutIndex } from '../layout';
import { isArray, type Value } from '../formula/values';
import type { Sheet } from '../sheet';
import { NO_CELL, type CellNo } from './cell-numbers';
import { Workbook, type CellAt, type WorkbookOptions } from './workbook';

export class WorkbookCopy extends Workbook {
  // Cells whose new value is on its way.
  private stale = new Set<CellNo>();

  constructor(opts: Omit<WorkbookOptions, 'trackForgotten'>) {
    super(opts);
  }

  /** A formula's value arrived (its whole array when it spills), so it shows and stops waiting. */
  acceptValue(sheetId: string, r: number, c: number, value: Value): void {
    const sheet = this.sheets.get(sheetId);
    const no = this.noAt(sheetId, r, c);
    if (!sheet || no === NO_CELL) return;
    this.stale.delete(no);
    this.spills.release(no);
    this.spills.unready(sheetId);
    this.vals.set(no, isArray(value) ? this.claim(no, sheet, r, c, value) : value);
    this.version++;
  }

  /** Cells whose new value is on its way keep their last one, shown faded. */
  markStale(cells: readonly CellAt[]): void {
    for (const at of cells) {
      const no = this.noAt(at.sheetId, at.r, at.c);
      if (no !== NO_CELL) this.stale.add(no);
    }
    if (cells.length > 0) this.version++;
  }

  /** Every value it holds waits for its new one. */
  markAllStale(): void {
    for (let no = 1; no < this.nos.size; no++) if (this.vals.has(no)) this.stale.add(no);
    this.version++;
  }

  // A value typed in (not a formula, nor in a formula's spill) is its input, here at once: it never waits, even when
  // the Worker's answer for it was dropped by a layout change that came after.
  override isStale(sheetId: string, r: number, c: number): boolean {
    if (this.stale.size === 0) return false;
    const at = this.nos.find(this.nos.sheetNo(sheetId), r, c);
    const owner = this.spills.ownerAt(at);
    if (owner === undefined) {
      const input = this.inputAt(sheetId, r, c);
      if (!input || !('f' in input)) return false;
    }
    return this.stale.has(owner ?? at);
  }

  // Whether a cell's value is worked out at all: a formula's, or a pivot table's at its empty anchor. A value held for
  // any other (a pivot table removed, its anchor emptied of a formula) is dropped, never shown stale.
  private worksOut(sheetId: string, r: number, c: number): boolean {
    const input = this.inputAt(sheetId, r, c);
    if (input) return 'f' in input;
    return this.spills.pivotAt(this.noAt(sheetId, r, c)) !== undefined;
  }

  protected override worksOutHere(): boolean {
    return false;
  }

  // A changed formula keeps its last value, waiting for its new one.
  protected override cellsChanged(changed: readonly CellNo[]): void {
    for (const no of changed) this.stale.add(no);
  }

  // Each value stays with its cell, by ids (`before`: a sheet as it was before its rows or columns moved), each
  // waiting for its new one from the Worker.
  protected override restart(before?: Sheet): void {
    const held: { sheetId: string; rowId: string; colId: string; value: Value }[] = [];
    for (let no = 1; no < this.nos.size; no++) {
      const value = this.vals.get(no);
      if (value === undefined) continue;
      const sheetId = this.nos.sheetIdOf(no);
      const layout = sheetId === before?.id ? before.layout : this.sheets.get(sheetId)?.layout;
      const rowId = layout?.rows[this.nos.rowOf(no)];
      const colId = layout?.cols[this.nos.colOf(no)];
      if (rowId && colId) held.push({ sheetId, rowId, colId, value });
    }
    this.resetAll();
    this.stale = new Set();
    for (const x of held) {
      const ix = layoutIndex(this.sheets.get(x.sheetId)!.layout);
      const r = ix.rowPos.get(x.rowId);
      const c = ix.colPos.get(x.colId);
      if (r === undefined || c === undefined || !this.worksOut(x.sheetId, r, c)) continue;
      this.acceptValue(x.sheetId, r, c, x.value);
      this.stale.add(this.noAt(x.sheetId, r, c));
    }
  }
}

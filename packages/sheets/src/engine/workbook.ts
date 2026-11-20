// The sheets of one tab and their values. Values are
// worked out on demand and kept; a change forgets only the cells that read it, directly or through others, plus
// the volatile ones. Long chains of references never overflow the stack: past a depth the deep cell is worked
// out first, from the top, and the read is tried again. Cells are held by number (cell-numbers.ts), their values and
// dependencies in typed columns (cell-values.ts, dependencies.ts).
import type { CardSource } from '../cards';
import { SheetLimits, type GridSize } from '../sheet-limits';
import { localMs, serialFromMs } from '../dates';
import { formatA1 } from '../address';
import { layoutIndex } from '../layout';
import { RECALC_READS_MAX } from '../limits';
import { cellKey, type Sheet } from '../sheet';
import { CARD_FUNCTION_NAMES } from '../formula/registry';
import { callsOf, type Node } from '../formula/ast';
import { safeHyperlink } from '../hyperlink';
import { storedAst, type SheetsCtx } from '../formula/stored';
import type { CellInput, StoredFormula } from '../sheet';
import {
  dims,
  err,
  isArray,
  scalarOf,
  type Scalar,
  type Value,
  type ValueArray,
} from '../formula/values';
import { CellNumbers, NO_CELL, type CellNo } from './cell-numbers';
import { CellValues } from './cell-values';
import { Dependencies } from './dependencies';
import { evaluate } from './evaluate';
import { deref } from '../formula/fn';
import type { Frame, RangeRef } from './frame';
import { formulaPrecedents } from './precedents';
import { sheetsCtxOf } from './sheets-ctx';
import { SPILL_PAST_EDGE, Spills, spillBlockedBy } from './spills';
import { ITERATION_OFF, Loops, sameIteration, type Iteration } from './loops';
import { LoopRounds, type LoopCells } from './loop-rounds';

type WorkbookOptions = {
  sheets: readonly Sheet[];
  locale: string;
  // Today and now in the viewer's local time, as a serial.
  now?: () => number;
  rand?: () => number;
  cards?: CardSource | null;
  // The limits its sheets are held to: a spreadsheet's, or (by default) a Plan Sheet's (sheet-limits.ts).
  limits?: SheetLimits;
  // How ranges in single-value places read: a spreadsheet's as Google's (intersected), a Plan Sheet's whole
  // (formulas.md "Arrays and spills"). By default, as its limits say what holds it.
  arrays?: ArrayDialect;
  // Iterative calculation (settings.md "Calculation"); off by default.
  iteration?: Iteration;
  // Where formulas are worked out (formulas.md "Recalculation"): `here` (by default), or `elsewhere`: the page's copy
  // of a Web Worker's values, which arrive by acceptValues and are never worked out here.
  values?: 'here' | 'elsewhere';
  // Note each formula value forgotten, for takeForgotten (the Worker's engine, sending what changed).
  trackForgotten?: boolean;
};

/** A cell by its sheet and position. */
export type CellAt = { sheetId: string; r: number; c: number };

/** `google`: implicit intersection outside an array context; `dynamic`: every formula an array context (Plan Sheets). */
export type ArrayDialect = 'google' | 'dynamic';

const DEPTH_MAX = 250;

// Google's words for a loop, with the loop's path after them.
const circular = (path: string) => `Circular dependency detected: ${path}`;

// Thrown when a read nests past DEPTH_MAX: the read settles that cell on its own, then starts again.
class Deep extends Error {
  override readonly name = 'FormulaTooDeep';
  readonly no: CellNo;
  constructor(no: CellNo) {
    super(`formula chain too deep at cell ${no}`);
    this.no = no;
  }
}

function localNow(): number {
  return serialFromMs(localMs(Date.now()));
}

export class Workbook {
  readonly locale: string;
  readonly limits: SheetLimits;
  readonly arrays: ArrayDialect;
  private readonly sheets = new Map<string, Sheet>();
  private cards: CardSource | null;
  private readonly nowFn: () => number;
  private readonly randFn: () => number;
  // Cells by number, and worked-out formula values by it. Both start afresh when positions move.
  private nos = new CellNumbers();
  private vals = new CellValues();
  private deps = new Dependencies();
  private readonly volatileCells = new Set<CellNo>();
  private readonly cardReaders = new Set<CellNo>();
  private spills = new Spills(this.nos);
  private readonly extents = new Map<string, { rows: number; cols: number }>();
  private readonly ctxs = new Map<string, SheetsCtx>();
  private readonly computing = new Set<CellNo>();
  private readonly stack: CellNo[] = [];
  private depth = 0;
  private reads = 0;
  // Formulas worked out after one read ran past RECALC_READS_MAX: their value is that read's
  // "too large" error, not their own, so the next read works them out afresh.
  private readonly overBudget = new Set<CellNo>();
  private iteration: Iteration;
  readonly worksOut: 'here' | 'elsewhere';
  // Formula values forgotten since takeForgotten, or every one (null) after a fresh start; undefined: not tracked.
  private forgotten: Set<CellNo> | null | undefined;
  // In a copy: cells whose new value is on its way (formulas.md "Recalculation": shown faded).
  private stale = new Set<CellNo>();
  private readonly loops = new Loops();
  private readonly rounds = new LoopRounds();
  // What iterative calculation's rounds need of the workbook.
  private readonly loopCells: LoopCells = {
    value: (no) => this.vals.get(no),
    forget: (no) => {
      this.vals.delete(no);
      this.spills.release(no);
    },
    compute: (no) => this.compute(no),
    idOf: (no) => this.idOf(no),
  };
  // Raised on every change, so views know to read again.
  version = 0;
  truncated = false;

  constructor(opts: WorkbookOptions) {
    this.locale = opts.locale;
    this.limits = opts.limits ?? SheetLimits.plan;
    this.arrays = opts.arrays ?? (this.limits === SheetLimits.spreadsheet ? 'google' : 'dynamic');
    this.cards = opts.cards ?? null;
    this.nowFn = opts.now ?? localNow;
    this.randFn = opts.rand ?? Math.random;
    this.iteration = opts.iteration ?? ITERATION_OFF;
    this.worksOut = opts.values ?? 'here';
    this.forgotten = opts.trackForgotten ? null : undefined;
    for (const s of opts.sheets) this.sheets.set(s.id, s);
    this.reindexAll();
  }

  // ---- The sheets ---------------------------------------------------------------------------------------

  /** The rows and columns a sheet may still grow by: its kind's limits over every sheet of the workbook. */
  room(sheetId: string): GridSize {
    const sheet = this.sheets.get(sheetId);
    if (!sheet) return { rows: 0, cols: 0 };
    const grids = [...this.sheets.values()].map((s) => ({
      rows: s.layout.rows.length,
      cols: s.layout.cols.length,
    }));
    return SheetLimits.room(
      this.limits,
      { rows: sheet.layout.rows.length, cols: sheet.layout.cols.length },
      SheetLimits.sizeOf(grids),
    );
  }

  sheet(id: string): Sheet | undefined {
    return this.sheets.get(id);
  }

  sheetList(): Sheet[] {
    return [...this.sheets.values()];
  }

  // A sheet's cells changed (`keys`, as cellKey), or anything else about it when `keys` is undefined (its layout,
  // its title, a new sheet): then everything is worked out afresh, since positions and names may have moved.
  updateSheet(sheet: Sheet, keys?: readonly string[]): void {
    const before = this.sheets.get(sheet.id);
    this.sheets.set(sheet.id, sheet);
    this.version++;
    if (!before || !keys || before.layout !== sheet.layout || before.title !== sheet.title) {
      this.restart(before);
      return;
    }
    this.extents.delete(sheet.id);
    this.ctxs.clear();
    const ix = layoutIndex(sheet.layout);
    const sheetNo = this.nos.sheetNo(sheet.id);
    const changed: CellNo[] = [];
    for (const key of keys) {
      const colon = key.indexOf(':');
      const r = ix.rowPos.get(key.slice(0, colon));
      const c = ix.colPos.get(key.slice(colon + 1));
      if (r === undefined || c === undefined) continue;
      const no = this.nos.intern(sheetNo, r, c);
      this.spills.index(sheet, key, no);
      this.rounds.retyped(`${sheet.id}|${key}`);
      changed.push(no);
    }
    // A copy keeps a changed formula's last value, waiting for its new one.
    if (this.worksOut === 'elsewhere') for (const no of changed) this.stale.add(no);
    else this.invalidate([...changed, ...this.volatileCells]);
    // Each changed cell is sent again, whatever it held: a new formula had no value to forget.
    if (this.forgotten) for (const no of changed) this.forgotten.add(no);
  }

  removeSheet(id: string): void {
    if (!this.sheets.delete(id)) return;
    this.version++;
    this.restart();
  }

  setCards(cards: CardSource | null): void {
    this.cards = cards;
    this.version++;
    this.invalidate([...this.cardReaders]);
  }

  /** Iterative calculation turned on or off, or its rounds or threshold changed: every value is worked out afresh. */
  setIteration(iteration: Iteration): void {
    if (sameIteration(this.iteration, iteration)) return;
    this.iteration = iteration;
    this.version++;
    this.restart();
  }

  // TODAY and NOW move on: forget every volatile cell.
  tick(): void {
    if (this.volatileCells.size === 0) return;
    this.version++;
    this.invalidate([...this.volatileCells]);
  }

  // ---- Worked out elsewhere (formulas.md "Recalculation") -------------------------------------------------

  /** The formula values forgotten since the last call (each to be worked out and sent), or `all` after a fresh start. */
  takeForgotten(): CellAt[] | 'all' {
    const forgotten = this.forgotten;
    this.forgotten = new Set();
    if (forgotten === undefined) throw new Error('takeForgotten needs trackForgotten');
    if (forgotten === null) return 'all';
    return [...forgotten].map((no) => this.cellAt(no));
  }

  /** In a copy: a formula's value arrived (its whole array when it spills), so it shows and stops waiting. */
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

  /** In a copy: cells whose new value is on its way keep their last one, shown faded. */
  markStale(cells: readonly CellAt[]): void {
    for (const at of cells) {
      const no = this.noAt(at.sheetId, at.r, at.c);
      if (no !== NO_CELL) this.stale.add(no);
    }
    if (cells.length > 0) this.version++;
  }

  /** Whether a cell's shown value is its last one, its new one on its way. */
  isStale(sheetId: string, r: number, c: number): boolean {
    if (this.stale.size === 0) return false;
    const owner = this.spills.ownerAt(this.nos.find(this.nos.sheetNo(sheetId), r, c));
    const no = owner ?? this.nos.find(this.nos.sheetNo(sheetId), r, c);
    return this.stale.has(no);
  }

  /** In a copy: every value it holds waits for its new one. */
  markAllStale(): void {
    for (let no = 1; no < this.nos.size; no++) if (this.vals.has(no)) this.stale.add(no);
    this.version++;
  }

  // Everything is worked out afresh. A copy keeps each value with its cell, by ids (`before`: a sheet as it was before
  // its rows or columns moved), each waiting for its new one from the Worker.
  private restart(before?: Sheet): void {
    if (this.worksOut === 'here') {
      this.resetAll();
      return;
    }
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
    for (const x of held) {
      const ix = layoutIndex(this.sheets.get(x.sheetId)!.layout);
      const r = ix.rowPos.get(x.rowId);
      const c = ix.colPos.get(x.colId);
      if (r === undefined || c === undefined) continue;
      this.acceptValue(x.sheetId, r, c, x.value);
      this.stale.add(this.noAt(x.sheetId, r, c));
    }
  }

  private cellAt(no: CellNo): CellAt {
    return { sheetId: this.nos.sheetIdOf(no), r: this.nos.rowOf(no), c: this.nos.colOf(no) };
  }

  // ---- Reading ------------------------------------------------------------------------------------------

  // A cell's value by position: its input, its formula's value (the top left of an array), or the value a spill
  // puts there.
  value(sheetId: string, r: number, c: number): Value {
    for (;;) {
      try {
        if (this.depth === 0) {
          this.startRead();
          const input = this.inputAt(sheetId, r, c);
          if (input && 'f' in input && this.worksOut === 'here')
            this.settleFirst(this.noAt(sheetId, r, c));
        }
        return scalarCell(this.cellValue(sheetId, r, c, null));
      } catch (e) {
        if (!(e instanceof Deep)) throw e;
        this.abandonLoops();
        this.settle(e.no);
      }
    }
  }

  // A stored formula worked out as if it sat in (r, c), keeping no value and no dependency: a format rule's Custom
  // Formula Is (docs/specs/029-sheets/conditional-formatting.md). Its reads count against the read budget.
  evaluateAt(sheetId: string, r: number, c: number, stored: StoredFormula): Value {
    const ast = storedAst(stored);
    if (!ast) return err('#ERROR!');
    return this.evaluateNodeAt(sheetId, r, c, ast, stored.r);
  }

  // Where a cell's HYPERLINK goes (docs/specs/029-sheets/formulas.md "Text"): the url argument of a formula that is a
  // HYPERLINK call at its top, worked out in the cell as evaluateAt works a rule out (no value kept, no dependency),
  // and kept only when safeHyperlink allows it. Null for any other cell, so the value stays the label everywhere.
  hyperlinkOf(sheetId: string, r: number, c: number): string | null {
    const input = this.inputAt(sheetId, r, c);
    if (!input || !('f' in input)) return null;
    const ast = storedAst(input.f);
    if (ast?.k !== 'call' || ast.name.toUpperCase() !== 'HYPERLINK' || !ast.args[0]) return null;
    return safeHyperlink(this.evaluateNodeAt(sheetId, r, c, ast.args[0], input.f.r));
  }

  // Worked out with NO_CELL as its reader: what it notes is forgotten as it ends.
  private evaluateNodeAt(
    sheetId: string,
    r: number,
    c: number,
    ast: Node,
    refs: StoredFormula['r'],
  ): Value {
    for (;;) {
      try {
        if (this.depth === 0) this.startRead();
        this.depth++;
        try {
          const frame = this.frame(NO_CELL, sheetId, r, c);
          return scalarCell(deref(evaluate(ast, refs, frame), frame));
        } finally {
          this.depth--;
          this.deps.clear(NO_CELL);
          this.volatileCells.delete(NO_CELL);
          this.cardReaders.delete(NO_CELL);
        }
      } catch (e) {
        if (!(e instanceof Deep)) throw e;
        this.abandonLoops();
        this.settle(e.no);
      }
    }
  }

  // A fresh top-level read: its own budget, and the formulas the last one cut short forgotten.
  private startRead(): void {
    this.reads = 0;
    if (this.overBudget.size === 0) return;
    for (const no of this.overBudget) {
      this.vals.delete(no);
      // A spill it claimed goes with it, and its sheet's spills are worked out again.
      if (this.spills.release(no)) this.spills.unready(this.nos.sheetIdOf(no));
    }
    this.overBudget.clear();
  }

  // The whole array a formula gives (its spill), or its value.
  formulaResult(sheetId: string, r: number, c: number): Value {
    const no = this.noAt(sheetId, r, c);
    if (no === NO_CELL) return null;
    this.value(sheetId, r, c);
    return this.vals.get(no) ?? null;
  }

  // The formula cell whose spill covers (r, c), as positions, when it is not the cell itself.
  spillOwnerAt(sheetId: string, r: number, c: number): { r: number; c: number } | null {
    this.value(sheetId, r, c);
    const owner = this.spills.ownerAt(this.noAt(sheetId, r, c));
    if (owner === undefined) return null;
    const claim = this.spills.claimOf(owner)!;
    return claim.r1 === r && claim.c1 === c ? null : { r: claim.r1, c: claim.c1 };
  }

  // How far a sheet is filled (positions + 1).
  extent(sheetId: string): { rows: number; cols: number } {
    let e = this.extents.get(sheetId);
    if (!e) {
      const sheet = this.sheets.get(sheetId);
      e = { rows: 0, cols: 0 };
      if (sheet) {
        const ix = layoutIndex(sheet.layout);
        for (const [key, cell] of sheet.cells) {
          if (!cell.input) continue;
          const i = key.indexOf(':');
          const r = ix.rowPos.get(key.slice(0, i));
          const c = ix.colPos.get(key.slice(i + 1));
          if (r === undefined || c === undefined) continue;
          if (r + 1 > e.rows) e.rows = r + 1;
          if (c + 1 > e.cols) e.cols = c + 1;
        }
      }
      this.extents.set(sheetId, e);
    }
    return e;
  }

  // Whether any formula on the tab reads Plan cards (so the editor loads the items).
  usesCards(): boolean {
    for (const sheet of this.sheets.values())
      for (const cell of sheet.cells.values()) {
        const f = cell.input && 'f' in cell.input ? cell.input.f : null;
        if (!f) continue;
        const ast = storedAst(f);
        if (ast && [...callsOf(ast)].some((n) => CARD_FUNCTION_NAMES.has(n))) return true;
      }
    return false;
  }

  ctxFor(sheetId: string): SheetsCtx {
    let ctx = this.ctxs.get(sheetId);
    if (!ctx) {
      ctx = sheetsCtxOf(this.sheets, sheetId, this.limits.input);
      this.ctxs.set(sheetId, ctx);
    }
    return ctx;
  }

  // ---- Internals ----------------------------------------------------------------------------------------

  // A cell's number, given on first sight; NO_CELL off its sheet's grid.
  private noAt(sheetId: string, r: number, c: number): CellNo {
    const sheet = this.sheets.get(sheetId);
    if (!sheet || r < 0 || c < 0 || r >= sheet.layout.rows.length || c >= sheet.layout.cols.length)
      return NO_CELL;
    return this.nos.intern(this.nos.sheetNo(sheetId), r, c);
  }

  private inputAt(sheetId: string, r: number, c: number): CellInput | undefined {
    const sheet = this.sheets.get(sheetId);
    const rowId = sheet?.layout.rows[r];
    const colId = sheet?.layout.cols[c];
    return rowId && colId ? sheet.cells.get(cellKey(rowId, colId))?.input : undefined;
  }

  // Work out a formula's static precedents deepest first, on an explicit stack, each once, so the read that follows
  // stays shallow however long the chain (formulas.md "Recalculation"). A loop is left to compute, which names it.
  private settleFirst(no: CellNo): void {
    if (this.vals.has(no)) return;
    // Most reads find every precedent worked out already: then nothing is walked.
    const first = this.precedentsOf(no);
    if (first.every((x) => this.vals.has(x))) return;
    const path = [no];
    const onPath = new Set(path);
    const left = new Map<CellNo, CellNo[]>();
    while (path.length > 0) {
      const top = path[path.length - 1]!;
      let todo = left.get(top);
      if (!todo) {
        todo = (top === no ? first : this.precedentsOf(top)).reverse();
        left.set(top, todo);
      }
      let child: CellNo | undefined;
      while (todo.length > 0 && child === undefined) {
        const next = todo.pop()!;
        if (!this.vals.has(next) && !onPath.has(next) && !this.computing.has(next)) child = next;
      }
      if (child !== undefined) {
        path.push(child);
        onPath.add(child);
        continue;
      }
      path.pop();
      onPath.delete(top);
      left.delete(top);
      if (!this.vals.has(top)) this.compute(top);
    }
  }

  private precedentsOf(no: CellNo): CellNo[] {
    const sheetId = this.nos.sheetIdOf(no);
    const input = this.inputAt(sheetId, this.nos.rowOf(no), this.nos.colOf(no));
    if (!input || !('f' in input)) return [];
    return formulaPrecedents(input.f, sheetId, (s) => this.sheets.get(s)).map((p) =>
      this.nos.intern(this.nos.sheetNo(p.sheet.id), p.r, p.c),
    );
  }

  private settle(no: CellNo): void {
    const pending = [no];
    while (pending.length > 0) {
      const top = pending[pending.length - 1]!;
      try {
        this.compute(top);
        pending.pop();
      } catch (e) {
        if (!(e instanceof Deep)) throw e;
        this.abandonLoops();
        const from = pending.indexOf(e.no);
        if (from >= 0) {
          // A chain deeper than DEPTH_MAX that comes back to a cell already restarted is a loop the
          // stack cannot see whole: each of its restarted cells is a circular reference. Their
          // dependencies were noted before the restart, so an edit breaking the loop still reaches them. Iterative
          // calculation does not reach such a loop (D36).
          const loop = pending.splice(from);
          const value = err('#REF!', circular(this.describeLoop(loop, e.no)));
          for (const cell of loop) this.vals.set(cell, value);
          continue;
        }
        pending.push(e.no);
      }
    }
  }

  private cellValue(sheetId: string, r: number, c: number, reader: CellNo | null): Value {
    const sheet = this.sheets.get(sheetId);
    const rowId = sheet?.layout.rows[r];
    const colId = sheet?.layout.cols[c];
    if (!sheet || !rowId || !colId) return null;
    const input = sheet.cells.get(cellKey(rowId, colId))?.input;
    // A number, text or truth is read as it stands; only a read noted or a formula needs the cell's number.
    if (input && reader === null) {
      if ('n' in input) return input.n;
      if ('s' in input) return input.s;
      if ('b' in input) return input.b;
    }
    // Only a cell noted, or a formula, needs a number of its own.
    const sheetNo = this.nos.sheetNo(sheetId);
    if (reader !== null || input) {
      const no = this.nos.intern(sheetNo, r, c);
      if (reader !== null) this.deps.noteCell(reader, no);
      if (input) {
        if ('n' in input) return input.n;
        if ('s' in input) return input.s;
        if ('b' in input) return input.b;
        return this.compute(no);
      }
    }
    return this.spilledAt(sheetId, sheetNo, r, c);
  }

  // An empty cell's value: what a spill puts there, found by its number once the spills over it are worked out.
  private spilledAt(sheetId: string, sheetNo: number, r: number, c: number): Value {
    this.ensureSpillers(sheetId, r, c);
    const owner = this.spills.ownerAt(this.nos.find(sheetNo, r, c));
    if (owner === undefined) return null;
    const claim = this.spills.claimOf(owner)!;
    const arr = this.vals.get(owner);
    if (!arr || !isArray(arr)) return null;
    return arr.rows[r - claim.r1]?.[c - claim.c1] ?? null;
  }

  // Work out the formulas that could spill over (r, c): those at or above and to its left. Once every spiller of a
  // sheet is worked out the sheet is ready, and empty cells read their claims straight away.
  private ensureSpillers(sheetId: string, r: number, c: number): void {
    if (this.spills.isReady(sheetId)) return;
    const set = this.spills.spillersIn(sheetId);
    if (!set || !this.sheets.has(sheetId)) {
      this.spills.markReady(sheetId);
      return;
    }
    let all = true;
    for (const no of set) {
      if (this.vals.has(no)) continue;
      if (this.nos.rowOf(no) > r || this.nos.colOf(no) > c || this.computing.has(no)) {
        all = false;
        continue;
      }
      this.compute(no);
    }
    if (all && this.computing.size === 0) this.spills.markReady(sheetId);
  }

  private compute(no: CellNo): Value {
    if (this.loops.isWaiting(no)) {
      // Finished, but its loop is still open: the reader joins the loop.
      this.loops.readBack(no);
      return this.vals.get(no)!;
    }
    const known = this.vals.get(no);
    if (known !== undefined) return known;
    if (this.computing.has(no)) {
      this.loops.readBack(no);
      if (this.iteration.on) return this.rounds.seedOf(no, this.loopCells);
      const from = this.stack.indexOf(no);
      return err('#REF!', circular(this.describeLoop(this.stack.slice(from), no)));
    }
    // A copy's value has not arrived yet: empty until it does.
    if (this.worksOut === 'elsewhere') return null;
    if (this.depth >= DEPTH_MAX) throw new Deep(no);
    const sheetId = this.nos.sheetIdOf(no);
    const row = this.nos.rowOf(no);
    const col = this.nos.colOf(no);
    const sheet = this.sheets.get(sheetId);
    const input = this.inputAt(sheetId, row, col);
    if (!sheet || !input || !('f' in input)) return null;
    this.deps.clear(no);
    this.volatileCells.delete(no);
    this.cardReaders.delete(no);
    this.spills.release(no);
    this.computing.add(no);
    this.stack.push(no);
    this.depth++;
    const visit = this.loops.enter(no);
    let value: Value;
    try {
      const ast = storedAst(input.f);
      if (!ast) value = err('#ERROR!');
      else {
        const frame = this.frame(no, sheetId, row, col);
        value = deref(evaluate(ast, input.f.r, frame), frame);
      }
    } finally {
      this.depth--;
      this.stack.pop();
      this.computing.delete(no);
    }
    if (isArray(value)) value = this.claim(no, sheet, row, col, value);
    this.vals.set(no, value);
    if (this.reads > RECALC_READS_MAX) this.overBudget.add(no);
    const loop = this.loops.leave(no, visit);
    return loop && loop.length > 0 ? this.closeLoop(loop) : value;
  }

  // A loop closed (its first cell first): with iterative calculation off each of its cells is the loop's #REF!; on, it
  // is worked out round by round. A loop closing inside a round of its own iteration is that round's, left as is.
  private closeLoop(loop: CellNo[]): Value {
    const first = loop[0]!;
    if (this.rounds.isIterating(first)) return this.vals.get(first)!;
    if (!this.iteration.on) {
      const value = err('#REF!', circular(this.describeLoop(loop, first)));
      for (const no of loop) {
        this.spills.release(no);
        this.vals.set(no, value);
      }
      console.debug(`[sheets engine] loop cells=${loop.length} iterate=false`);
      return value;
    }
    const rounds = this.rounds.run(loop, this.iteration, this.loopCells);
    console.debug(`[sheets engine] loop cells=${loop.length} iterate=true rounds=${rounds}`);
    return this.vals.get(first) ?? null;
  }

  // Formulas waiting on a loop whose work was cut off are worked out afresh.
  private abandonLoops(): void {
    for (const no of this.loops.abandon()) {
      this.vals.delete(no);
      this.spills.release(no);
    }
  }

  private idOf(no: CellNo): string {
    const sheet = this.sheets.get(this.nos.sheetIdOf(no))!;
    return `${sheet.id}|${cellKey(sheet.layout.rows[this.nos.rowOf(no)]!, sheet.layout.cols[this.nos.colOf(no)]!)}`;
  }

  private claim(no: CellNo, sheet: Sheet, row: number, col: number, value: ValueArray): Value {
    const d = dims(value);
    if (d.rows === 0 || d.cols === 0) return err('#N/A', 'The result is empty');
    if (d.rows === 1 && d.cols === 1) return scalarOf(value.rows[0]![0]!);
    const sheetNo = this.nos.sheetNo(sheet.id);
    const claim = {
      sheetId: sheet.id,
      r1: row,
      c1: col,
      r2: row + d.rows - 1,
      c2: col + d.cols - 1,
    };
    // A spill reads its whole rectangle, so filling or emptying a cell in it re-works the spill.
    this.deps.noteRange(no, sheetNo, row, col, claim.r2, claim.c2);
    if (claim.r2 >= sheet.layout.rows.length || claim.c2 >= sheet.layout.cols.length)
      return err('#REF!', SPILL_PAST_EDGE);
    const blocker = this.spills.blocker(sheet, no, claim);
    if (blocker) return err('#REF!', spillBlockedBy(blocker));
    const readers = new Set<CellNo>();
    for (const cell of this.spills.place(no, claim))
      if (cell !== no)
        this.deps.readersOf(cell, sheetNo, this.nos.rowOf(cell), this.nos.colOf(cell), readers);
    // Whatever read these cells as empty before the spill reached them reads again.
    readers.delete(no);
    if (readers.size > 0) this.invalidate([...readers]);
    return value;
  }

  private frame(id: CellNo, sheetId: string, row: number, col: number): Frame {
    return {
      sheetId,
      row,
      col,
      ctx: this.ctxFor(sheetId),
      locale: this.locale,
      arrays: this.arrays === 'dynamic',
      cell: (s, r, c, inRange) => this.cellValue(s, r, c, inRange ? null : id),
      extent: (s) => this.extent(s),
      isFormula: (s, r, c) => {
        const input = this.inputAt(s, r, c);
        return !!input && 'f' in input;
      },
      grid: (s) => {
        const sh = this.sheets.get(s);
        return sh ? { rows: sh.layout.rows.length, cols: sh.layout.cols.length } : undefined;
      },
      spillOf: (s, r, c): RangeRef | null => {
        const owner = this.noAt(s, r, c);
        if (owner === NO_CELL) return null;
        this.cellValue(s, r, c, id);
        const claim = this.spills.claimOf(owner);
        return claim ? { ...claim } : null;
      },
      noteRange: (range) =>
        this.deps.noteRange(
          id,
          this.nos.sheetNo(range.sheetId),
          range.r1,
          range.c1,
          range.r2,
          range.c2,
        ),
      spend: (n) => {
        this.reads += n;
        if (this.reads > RECALC_READS_MAX) {
          this.truncated = true;
          return false;
        }
        return true;
      },
      now: this.nowFn,
      rand: this.randFn,
      cards: this.cards,
      volatile: () => this.volatileCells.add(id),
      readsCards: () => this.cardReaders.add(id),
    };
  }

  // Forget the given cells' values and, transitively, every value that read them.
  private invalidate(nos: readonly CellNo[]): void {
    const queue = [...nos];
    const seen = new Set<CellNo>();
    while (queue.length > 0) {
      const no = queue.pop()!;
      if (seen.has(no)) continue;
      seen.add(no);
      // A cell being worked out right now gets its fresh value anyway; NO_CELL keeps nothing.
      if (this.computing.has(no) || no === NO_CELL) continue;
      const sheetId = this.nos.sheetIdOf(no);
      const sheetNo = this.nos.sheetNoOf(no);
      if (this.vals.delete(no)) {
        this.spills.unready(sheetId);
        this.forgotten?.add(no);
      }
      const claim = this.spills.release(no);
      const readers = new Set<CellNo>();
      const r = this.nos.rowOf(no);
      const c = this.nos.colOf(no);
      this.deps.readersOf(no, sheetNo, r, c, readers);
      // A cell inside someone's spill: the spill's owner is re-worked (it may now be blocked).
      const owner = this.spills.ownerAt(no);
      if (owner !== undefined && owner !== no) readers.add(owner);
      if (claim) {
        // Everything that read the spilled cells reads again.
        for (let rr = claim.r1; rr <= claim.r2; rr++)
          for (let cc = claim.c1; cc <= claim.c2; cc++)
            this.deps.readersOf(this.nos.find(sheetNo, rr, cc), sheetNo, rr, cc, readers);
      }
      for (const x of readers) if (!seen.has(x)) queue.push(x);
    }
  }

  private resetAll(): void {
    if (this.forgotten) this.forgotten = null;
    this.stale = new Set();
    this.nos = new CellNumbers();
    this.vals = new CellValues();
    this.deps = new Dependencies();
    this.spills = new Spills(this.nos);
    this.volatileCells.clear();
    this.cardReaders.clear();
    this.extents.clear();
    this.ctxs.clear();
    this.overBudget.clear();
    this.truncated = false;
    this.reindexAll();
  }

  private reindexAll(): void {
    this.spills.indexAll(this.sheets.values());
  }

  private describeLoop(path: CellNo[], back: CellNo): string {
    return [...path, back]
      .map((no) => formatA1(this.nos.rowOf(no), this.nos.colOf(no)))
      .join(' → ');
  }
}

function scalarCell(v: Value): Scalar {
  return isArray(v) ? scalarOf(v) : v;
}

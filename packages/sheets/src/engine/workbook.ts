// The sheets of one tab and their values. Values are
// worked out on demand and kept; a change forgets only the cells that read it, directly or through others, plus
// the volatile ones. Long chains of references never overflow the stack: past a depth the deep cell is worked
// out first, from the top, and the read is tried again. Cells are held by number (cell-numbers.ts), their values and
// dependencies in typed columns (cell-values.ts, dependencies.ts).
import type { CardSource } from '../cards';
import { STANDARD_THEME, type SpreadsheetTheme } from '../themes/spreadsheet-theme';
import { workbookClock, type ArrayDialect, type WorkbookOptions } from './workbook-options';
import { SheetLimits, type GridSize } from '../sheet-limits';
import { formatA1 } from '../address';
import { workbookFilterReads } from '../filter-reads';
import { layoutIndex } from '../layout';
import { RECALC_READS_MAX } from '../limits';
import { cellKey, type Sheet } from '../sheet';
import { CARD_FUNCTION_NAMES } from '../formula/registry';
import {
  FETCHING_FUNCTION_NAMES,
  type ImportAnswer,
  type ImportAsk,
} from '../imports/import-request';
import { ImportBook, type ImportFamily } from './import-book';
import { callsOf, type Node } from '../formula/ast';
import {
  compileNamedFunctions,
  type NamedFunction,
  type NamedFunctionDef,
} from '../named-functions';
import type { FormulaMeaning } from '../formula/meaning';
import { safeHyperlink } from '../hyperlink';
import type { Sparkline } from '../sparkline/sparkline-read';
import { SparklineMemo } from './sparkline-memo';
import type { CellImage } from '../images/cell-image';
import { IMAGE_FUNCTION_NAMES, ImageFinder } from './image-of';
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
import { cellFrame, type FrameSource } from './cell-frame';
import { evaluateWith } from './what-if';
import type { Swap } from './frame';
import {
  isRef,
  type CellAt,
  type DrawHooks,
  type EvalValue,
  type RangeRef,
  type RefValue,
} from './frame';
import { formulaPrecedents } from './precedents';
import { sheetsCtxOf } from './sheets-ctx';
import { SPILL_PAST_EDGE, Spills, spillBlockedBy } from './spills';
import type { SheetPivot } from '../objects/sheet-pivot';
import { pivotOutput } from '../pivot/pivot-output';
import {
  isPivotArray,
  PIVOT_BLOCKED_BY,
  PIVOT_NO_SOURCE,
  PIVOT_OUTPUT_CELLS_MAX,
  PIVOT_PAST_EDGE,
  PIVOT_SOURCE_CELLS_MAX,
  PIVOT_TOO_LARGE,
  pivotArray,
  pivotBox,
  pivotSpecOf,
  readPivotSource,
} from '../pivot/pivot-resolve';
import type { CellFormat } from '../sheet';
import { ITERATION_OFF, Loops, sameIteration, type Iteration } from './loops';
import { LoopRounds, type LoopCells } from './loop-rounds';

export type { CellAt, ArrayDialect, WorkbookOptions };

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

const RANGE_IMPORT_NAMES: ReadonlySet<string> = new Set(['IMPORTRANGE']);

export class Workbook {
  readonly locale: string;
  readonly meaning: FormulaMeaning;
  readonly timeZone: string | undefined;
  readonly limits: SheetLimits;
  readonly arrays: ArrayDialect;
  protected readonly sheets = new Map<string, Sheet>();
  private cards: CardSource | null;
  private readonly nowFn: () => number;
  private readonly randFn: () => number;
  // Cells by number, and worked-out formula values by it. Both start afresh when positions move.
  protected nos = new CellNumbers();
  protected vals = new CellValues();
  private deps = new Dependencies();
  private readonly volatileCells = new Set<CellNo>();
  private readonly cardReaders = new Set<CellNo>();
  private readonly importBook: ImportBook | null;
  // Formulas whose value read NOW, RAND, RANDARRAY or RANDBETWEEN, directly or through cells (imports.md "Errors"),
  // and whether the formula being worked out has so far.
  private readonly nowish = new Set<CellNo>();
  private nowSeen = false;
  protected spills = new Spills(this.nos);
  private readonly extents = new Map<string, { rows: number; cols: number }>();
  private readonly ctxs = new Map<string, SheetsCtx>();
  // The spreadsheet's named functions (formulas.md "Named functions"), each definition read once.
  private functions: readonly NamedFunction[] = [];
  private namedDefs: ReadonlyMap<string, NamedFunctionDef> = new Map();
  private readonly computing = new Set<CellNo>();
  private readonly stack: CellNo[] = [];
  private depth = 0;
  private reads = 0;
  // Formulas worked out after one read ran past RECALC_READS_MAX: their value is that read's
  // "too large" error, not their own, so the next read works them out afresh.
  private readonly overBudget = new Set<CellNo>();
  private iteration: Iteration;
  // Formula values forgotten since takeForgotten, or every one (null) after a fresh start; undefined: not tracked.
  private forgotten: Set<CellNo> | null | undefined;
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
  // What a formula's frame reads of the workbook (cell-frame.ts).
  private readonly frameSource: FrameSource;
  // The workbook's theme (formatting.md "Themes"), which cells' theme colours are drawn in.
  theme: SpreadsheetTheme = STANDARD_THEME;
  // Raised on every change, so views know to read again.
  version = 0;
  truncated = false;

  /** Draws cells in another theme: every view reads again. */
  setTheme(theme: SpreadsheetTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.version++;
  }

  constructor(opts: WorkbookOptions) {
    this.locale = opts.locale;
    this.meaning = opts.meaning ?? 'google';
    this.timeZone = opts.timeZone;
    this.limits = opts.limits ?? SheetLimits.plan;
    this.arrays = opts.arrays ?? (this.limits === SheetLimits.spreadsheet ? 'google' : 'dynamic');
    this.cards = opts.cards ?? null;
    this.importBook = opts.imports
      ? new ImportBook(opts.imports.access, opts.imports.web ?? true)
      : null;
    this.nowFn = opts.now ?? workbookClock(opts.timeZone);
    this.randFn = opts.rand ?? Math.random;
    this.iteration = opts.iteration ?? ITERATION_OFF;
    if (opts.functions) this.useFunctions(opts.functions);
    this.frameSource = {
      locale: this.locale,
      meaning: this.meaning,
      arraysWhole: this.arrays === 'dynamic',
      now: this.nowFn,
      rand: this.randFn,
      cards: () => this.cards,
      ctx: (s) => this.ctxFor(s),
      extent: (s) => this.extent(s),
      sheet: (s) => this.sheets.get(s),
      filterReads: (s) => workbookFilterReads(this, s),
      sheetCount: () => this.sheets.size,
      sheetNumber: (s) => [...this.sheets.keys()].indexOf(s) + 1,
      input: (s, r, c) => this.inputAt(s, r, c),
      cell: (s, r, c, reader) => this.cellValue(s, r, c, reader),
      noAt: (s, r, c) => this.noAt(s, r, c),
      claimOf: (owner) => this.spills.claimOf(owner),
      readersOf: (at) => this.readersOf(at),
      noteRange: (reader, range) =>
        this.deps.noteRange(
          reader,
          this.nos.sheetNo(range.sheetId),
          range.r1,
          range.c1,
          range.r2,
          range.c2,
        ),
      spend: (n) => this.spend(n),
      volatile: (reader, name) => {
        this.volatileCells.add(reader);
        // TODAY moves once a day, so an import may read it (Google's exception).
        if (name !== 'TODAY') this.nowSeen = true;
      },
      readsCards: (reader) => this.cardReaders.add(reader),
      importOf: (reader, request) => this.importBook?.read(request, reader) ?? null,
      importAccess: (reader) => this.importBook?.accessFor(reader) ?? null,
      watchNow: (run) => {
        const outer = this.nowSeen;
        this.nowSeen = false;
        try {
          const value = run();
          return [value, this.nowSeen];
        } finally {
          this.nowSeen ||= outer;
        }
      },
    };
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
    this.importBook?.retyped(changed);
    this.cellsChanged(changed);
    // Each changed cell is sent again, whatever it held: a new formula had no value to forget.
    if (this.forgotten) for (const no of changed) this.forgotten.add(no);
  }

  removeSheet(id: string): void {
    if (!this.sheets.delete(id)) return;
    this.version++;
    this.restart();
  }

  // The sheets in a new order, a spreadsheet's tabs moved (spreadsheet.md "Sheets in the sheet bar"): SHEET and SHEETS
  // count them so. Sheets not named keep their order after those named; an unknown id is passed over.
  orderSheets(ids: readonly string[]): void {
    const was = [...this.sheets.keys()];
    const named = new Set(ids);
    const order = [
      ...ids.filter((id) => this.sheets.has(id)),
      ...was.filter((id) => !named.has(id)),
    ];
    if (order.every((id, i) => id === was[i])) return;
    const held = new Map(this.sheets);
    this.sheets.clear();
    for (const id of order) this.sheets.set(id, held.get(id)!);
    this.version++;
    this.restart();
  }

  setCards(cards: CardSource | null): void {
    this.cards = cards;
    this.version++;
    this.invalidate([...this.cardReaders]);
  }

  // ---- Imports (imports.md) ----------------------------------------------------------------------------

  /** An import's answer arrived from the page: the cells reading it are worked out again when it changed. */
  landImport(key: string, answer: ImportAnswer): void {
    this.forgetImportReaders(this.importBook?.land(key, answer) ?? []);
  }

  /** Access to the web allowed for the spreadsheet: every import is read again. */
  allowImports(): void {
    this.forgetImportReaders(this.importBook?.allow() ?? []);
  }

  /** The spreadsheet was synced to LiveDoc: its imports wait for Allow Access (or fetch, already allowed). */
  onlineImports(allowed: boolean): void {
    this.forgetImportReaders(this.importBook?.online(allowed) ?? []);
  }

  /** A family's time is up (the web's hour, IMPORTRANGE's minute): its imports still read are asked again. */
  refreshImports(family: ImportFamily): void {
    this.importBook?.refresh(family);
  }

  /** The imports to ask of the page since the last call. */
  takeImportAsks(): ImportAsk[] {
    return this.importBook?.takeAsks() ?? [];
  }

  private forgetImportReaders(nos: CellNo[]): void {
    if (nos.length === 0) return;
    this.version++;
    this.invalidate(nos);
  }

  /** The iterative calculation in force. */
  iterationSetting(): Iteration {
    return this.iteration;
  }

  /** Iterative calculation turned on or off, or its rounds or threshold changed: every value is worked out afresh. */
  setIteration(iteration: Iteration): void {
    if (sameIteration(this.iteration, iteration)) return;
    this.iteration = iteration;
    this.version++;
    this.restart();
  }

  /** The named functions in force. */
  functionList(): readonly NamedFunction[] {
    return this.functions;
  }

  /** The named functions changed (made, edited, removed): every value is worked out afresh. */
  setFunctions(functions: readonly NamedFunction[]): void {
    if (functions === this.functions) return;
    this.useFunctions(functions);
    this.version++;
    this.restart();
  }

  private useFunctions(functions: readonly NamedFunction[]): void {
    this.functions = functions;
    this.namedDefs = compileNamedFunctions(functions);
  }

  // TODAY and NOW move on: forget every volatile cell.
  tick(): void {
    if (this.volatileCells.size === 0) return;
    this.version++;
    this.invalidate([...this.volatileCells]);
  }

  /** The formula values forgotten since the last call (each to be worked out and sent), or `all` after a fresh start. */
  takeForgotten(): CellAt[] | 'all' {
    const forgotten = this.forgotten;
    this.forgotten = new Set();
    if (forgotten === undefined) throw new Error('takeForgotten needs trackForgotten');
    if (forgotten === null) return 'all';
    return [...forgotten].map((no) => this.cellAt(no));
  }

  /** Whether a cell's shown value is its last one, its new one on its way (only ever in a WorkbookCopy). */
  isStale(_sheetId: string, _r: number, _c: number): boolean {
    return false;
  }

  // Whether formulas are worked out here: a WorkbookCopy's values arrive from a Worker instead.
  protected worksOutHere(): boolean {
    return true;
  }

  // Cells of a sheet changed: forget what read them (a WorkbookCopy keeps them, waiting).
  protected cellsChanged(changed: readonly CellNo[]): void {
    this.invalidate([...changed, ...this.volatileCells]);
  }

  // Everything is worked out afresh (`before`: a sheet as it was before its rows or columns moved).
  protected restart(_before?: Sheet): void {
    this.resetAll();
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
          if (input && 'f' in input && this.worksOutHere())
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

  /** Today's serial in the workbook's time zone (a filter's date periods). */
  today(): number {
    return Math.floor(this.nowFn());
  }

  // A stored formula worked out as if it sat in (r, c), keeping no value and no dependency: a format rule's Custom
  // Formula Is (docs/specs/029-sheets/conditional-formatting.md). Its reads count against the read budget.
  evaluateAt(sheetId: string, r: number, c: number, stored: StoredFormula): Value {
    const ast = storedAst(stored);
    if (!ast) return err('#ERROR!');
    return this.evaluateNodeAt(sheetId, r, c, ast, stored.r);
  }

  // A stored formula worked out as if it sat in (r, c) with some cells read as stand-ins, keeping no value and no
  // dependency: a validation rule's Custom Formula Is checking a value before it is written (data-validation.md).
  evaluateWith(
    sheetId: string,
    r: number,
    c: number,
    stored: StoredFormula,
    swaps: readonly Swap[],
  ): Value {
    // Worked out as it stands first, so the cells between it and the swaps are in the dependency graph.
    const plain = this.evaluateAt(sheetId, r, c, stored);
    if (!swaps.length) return plain;
    return this.readAside(() =>
      scalarCell(
        evaluateWith(this.frameSource, NO_CELL, { sheetId, r, c }, stored, swaps) ?? err('#ERROR!'),
      ),
    );
  }

  // The cells a reference formula names, worked out as if it sat at the sheet's top left, keeping nothing: the
  // range IMPORTRANGE reads of a source (docs/specs/029-sheets/formulas.md "Other workbooks"). Null when it names none.
  rangeOf(sheetId: string, stored: StoredFormula): RangeRef | null {
    const ast = storedAst(stored);
    if (!ast) return null;
    let raw: EvalValue | null = null;
    this.evaluateNodeAt(sheetId, 0, 0, ast, stored.r, { answer: (v) => (raw = v) });
    return raw !== null && isRef(raw) ? (raw as RefValue).ref : null;
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

  private readonly sparklines = new SparklineMemo();

  // A cell's SPARKLINE chart (charts.md "Sparklines"): its formula worked out again, as hyperlinkOf does, with each
  // SPARKLINE reporting its chart; drawn when the value is the empty text a SPARKLINE gives. Null for any other cell.
  sparklineOf(sheetId: string, r: number, c: number): Sparkline | null {
    const input = this.inputAt(sheetId, r, c);
    if (!input || !('f' in input)) return null;
    const ast = storedAst(input.f);
    if (!ast || !SparklineMemo.calls(ast)) return null;
    return this.sparklines.get(`${sheetId}!${r},${c}`, this.version, () => {
      let chart: Sparkline | null = null;
      const value = this.evaluateNodeAt(sheetId, r, c, ast, input.f.r, {
        drawSparkline: (drawn) => {
          chart = drawn;
        },
      });
      return value === '' ? chart : null;
    });
  }

  private readonly images = new ImageFinder({
    version: () => this.version,
    callsImage: () => this.calls(IMAGE_FUNCTION_NAMES),
    value: (sheetId, r, c) => this.value(sheetId, r, c),
    spillOwnerAt: (sheetId, r, c) => this.spillOwnerAt(sheetId, r, c),
    redraw: (sheetId, r, c, hooks) => this.redraw(sheetId, r, c, hooks),
  });

  // A cell's picture (imports.md "IMAGE"): drawn by its own formula's IMAGE, or followed from the cell it answers or
  // a lookup found (engine/image-of.ts). Null for a cell showing anything but the empty text an IMAGE gives.
  imageOf(sheetId: string, r: number, c: number): CellImage | null {
    return this.images.imageOf(sheetId, r, c);
  }

  // The formula at (r, c) worked out again with drawing hooks, as sparklineOf does; false for a cell without one.
  private redraw(sheetId: string, r: number, c: number, hooks: DrawHooks): boolean {
    const input = this.inputAt(sheetId, r, c);
    const ast = input && 'f' in input ? storedAst(input.f) : null;
    if (!ast || !input || !('f' in input)) return false;
    this.evaluateNodeAt(sheetId, r, c, ast, input.f.r, hooks);
    return true;
  }

  // Worked out with NO_CELL as its reader: what it notes is forgotten as it ends.
  private evaluateNodeAt(
    sheetId: string,
    r: number,
    c: number,
    ast: Node,
    refs: StoredFormula['r'],
    hooks: DrawHooks = {},
  ): Value {
    return this.readAside(() => {
      const frame = cellFrame(this.frameSource, NO_CELL, sheetId, r, c);
      const { answer, ...drawing } = hooks;
      Object.assign(frame, drawing);
      const raw = evaluate(ast, refs, frame);
      answer?.(raw);
      return scalarCell(deref(raw, frame));
    });
  }

  // A read on no cell's behalf (NO_CELL its reader): what it notes is forgotten as it ends; a loop too deep to follow
  // is settled and the read run again.
  private readAside(run: () => Value): Value {
    for (;;) {
      try {
        if (this.depth === 0) this.startRead();
        this.depth++;
        try {
          return run();
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

  // The number format a pivot table's output gives (r, c) (pivot-tables.md "In the grid", D382): its source column's,
  // or a percentage; undefined for any other cell. A cell's own number format wins where it is drawn.
  pivotFormatAt(sheetId: string, r: number, c: number): CellFormat | undefined {
    this.value(sheetId, r, c);
    const owner = this.spills.ownerAt(this.noAt(sheetId, r, c));
    if (owner === undefined) return undefined;
    const arr = this.vals.get(owner);
    if (!isPivotArray(arr)) return undefined;
    const claim = this.spills.claimOf(owner)!;
    return arr.fmts[r - claim.r1]![c - claim.c1];
  }

  // A cell's format as its value is shown: its own, with a pivot table's number format where it sets none
  // (pivot-tables.md "In the grid", D382).
  shownFormat(
    sheetId: string,
    r: number,
    c: number,
    own: CellFormat | undefined,
  ): CellFormat | undefined {
    if (own?.nf || !this.spills.hasPivots()) return own;
    const given = this.pivotFormatAt(sheetId, r, c);
    return given ? { ...own, ...given } : own;
  }

  // Whether a formula or a pivot table on the sheet may spill, so a cell with no input may still show a value.
  maySpill(sheetId: string): boolean {
    return (this.spills.spillersIn(sheetId)?.size ?? 0) > 0;
  }

  // How far a sheet shows values (positions + 1): its inputs, and the arrays and pivot tables spilled past them.
  shownExtent(sheetId: string): { rows: number; cols: number } {
    const e = { ...this.extent(sheetId) };
    for (const no of this.spills.spillersIn(sheetId) ?? []) {
      this.value(sheetId, this.nos.rowOf(no), this.nos.colOf(no));
      const claim = this.spills.claimOf(no);
      if (!claim) continue;
      e.rows = Math.max(e.rows, claim.r2 + 1);
      e.cols = Math.max(e.cols, claim.c2 + 1);
    }
    return e;
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
    return this.calls(CARD_FUNCTION_NAMES);
  }

  // Whether any formula imports from the web (so the editor shows the Allow Access bar until it is allowed).
  usesImports(): boolean {
    return this.calls(FETCHING_FUNCTION_NAMES);
  }

  // Whether any formula reads another spreadsheet (so a spreadsheet in This Browser is offered Sync Document).
  usesRangeImports(): boolean {
    return this.calls(RANGE_IMPORT_NAMES);
  }

  private calls(direct: ReadonlySet<string>): boolean {
    const names = this.namedCalling(direct);
    for (const sheet of this.sheets.values())
      for (const cell of sheet.cells.values()) {
        const f = cell.input && 'f' in cell.input ? cell.input.f : null;
        if (!f) continue;
        const ast = storedAst(f);
        if (ast && [...callsOf(ast)].some((n) => names.has(n))) return true;
      }
    return false;
  }

  // The names given and every named function whose definition calls one of them, however deep.
  private namedCalling(direct: ReadonlySet<string>): ReadonlySet<string> {
    const names = new Set(direct);
    for (let grew = true; grew;) {
      grew = false;
      for (const def of this.namedDefs.values())
        if (!names.has(def.name) && [...callsOf(def.ast)].some((n) => names.has(n))) {
          names.add(def.name);
          grew = true;
        }
    }
    return names;
  }

  ctxFor(sheetId: string): SheetsCtx {
    let ctx = this.ctxs.get(sheetId);
    if (!ctx) {
      ctx = {
        ...sheetsCtxOf(this.sheets, sheetId, this.limits.input),
        fn: (name) => this.namedDefs.get(name) ?? null,
      };
      this.ctxs.set(sheetId, ctx);
    }
    return ctx;
  }

  // ---- Internals ----------------------------------------------------------------------------------------

  // A cell's number, given on first sight; NO_CELL off its sheet's grid.
  protected noAt(sheetId: string, r: number, c: number): CellNo {
    const sheet = this.sheets.get(sheetId);
    if (!sheet || r < 0 || c < 0 || r >= sheet.layout.rows.length || c >= sheet.layout.cols.length)
      return NO_CELL;
    return this.nos.intern(this.nos.sheetNo(sheetId), r, c);
  }

  // The formula cells reading a cell, as the dependency graph has them now.
  private readersOf(at: CellAt): CellAt[] {
    const sheetNo = this.nos.sheetNo(at.sheetId);
    const out = new Set<CellNo>();
    this.deps.readersOf(this.nos.find(sheetNo, at.r, at.c), sheetNo, at.r, at.c, out);
    out.delete(NO_CELL);
    return [...out].map((no) => this.cellAt(no));
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
    // Only a cell noted, a formula or an empty pivot table anchor needs a number of its own.
    const sheetNo = this.nos.sheetNo(sheetId);
    const anchor = !input && this.spills.pivotAt(this.nos.find(sheetNo, r, c)) !== undefined;
    if (reader !== null || input || anchor) {
      const no = this.nos.intern(sheetNo, r, c);
      if (reader !== null) this.deps.noteCell(reader, no);
      if (input) {
        if ('n' in input) return input.n;
        if ('s' in input) return input.s;
        if ('b' in input) return input.b;
      }
      if (input || anchor) return this.compute(no);
    }
    return this.spilledAt(sheetId, sheetNo, r, c);
  }

  // An empty cell's value: what a spill puts there, found by its number once the spills over it are worked out.
  private spilledAt(sheetId: string, sheetNo: number, r: number, c: number): Value {
    this.ensureSpillers(sheetId, r, c);
    const owner = this.spills.ownerAt(this.nos.find(sheetNo, r, c));
    if (owner === undefined) return null;
    const claim = this.spills.claimOf(owner)!;
    if (this.nowish.has(owner)) this.nowSeen = true;
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
    if (known !== undefined) {
      if (this.nowish.has(no)) this.nowSeen = true;
      return known;
    }
    if (this.computing.has(no)) {
      this.loops.readBack(no);
      if (this.iteration.on) return this.rounds.seedOf(no, this.loopCells);
      const from = this.stack.indexOf(no);
      return err('#REF!', circular(this.describeLoop(this.stack.slice(from), no)));
    }
    // A copy's value has not arrived yet: empty until it does.
    if (!this.worksOutHere()) return null;
    if (this.depth >= DEPTH_MAX) throw new Deep(no);
    const sheetId = this.nos.sheetIdOf(no);
    const row = this.nos.rowOf(no);
    const col = this.nos.colOf(no);
    const sheet = this.sheets.get(sheetId);
    const input = this.inputAt(sheetId, row, col);
    // An empty pivot table anchor works its output out; a filled one is its input (pivot-tables.md "In the grid").
    const pivot = input ? undefined : this.spills.pivotAt(no);
    const formula = input && 'f' in input ? input.f : null;
    if (!sheet || (!formula && !pivot)) return null;
    this.deps.clear(no);
    this.volatileCells.delete(no);
    this.cardReaders.delete(no);
    this.importBook?.dropReader(no);
    this.spills.release(no);
    const outerNow = this.nowSeen;
    this.nowSeen = false;
    this.computing.add(no);
    this.stack.push(no);
    this.depth++;
    const visit = this.loops.enter(no);
    let value: Value;
    try {
      if (formula) {
        const ast = storedAst(formula);
        if (!ast) value = err('#ERROR!');
        else {
          const frame = cellFrame(this.frameSource, no, sheetId, row, col);
          value = deref(evaluate(ast, formula.r, frame), frame);
        }
      } else value = this.pivotValue(no, sheet, pivot!);
    } finally {
      this.depth--;
      this.stack.pop();
      this.computing.delete(no);
      if (this.nowSeen) this.nowish.add(no);
      else this.nowish.delete(no);
      this.nowSeen ||= outerNow;
    }
    if (isArray(value)) value = this.claim(no, sheet, row, col, value);
    this.vals.set(no, value);
    if (this.reads > RECALC_READS_MAX) this.overBudget.add(no);
    const loop = this.loops.leave(no, visit);
    return loop && loop.length > 0 ? this.closeLoop(loop) : value;
  }

  // A pivot table's output (pivot-tables.md "In the grid"): its source read (and noted as read) as it stands now,
  // worked out, and held with its cells' formats; an error when its source is gone or it is too large; blank when it
  // has nothing to show.
  private pivotValue(no: CellNo, sheet: Sheet, pivot: SheetPivot): Value {
    const box = pivotBox(pivot, {
      own: sheet,
      byId: (id) => this.sheets.get(id),
      byTitle: (title) => {
        const h = this.ctxFor(sheet.id).byTitle(title);
        return h && this.sheets.get(h.id);
      },
    });
    if (!box) return err('#REF!', PIVOT_NO_SOURCE);
    const cells = (box.r2 - box.r1 + 1) * (box.c2 - box.c1 + 1);
    if (cells > PIVOT_SOURCE_CELLS_MAX) return err('#REF!', PIVOT_TOO_LARGE);
    const sourceId = box.sheet.id;
    this.deps.noteRange(no, this.nos.sheetNo(sourceId), box.r1, box.c1, box.r2, box.c2);
    if (!this.spend(cells)) return err('#NUM!', 'This sheet is too large to recalculate at once');
    const read = readPivotSource(box, (r, c) => this.cellValue(sourceId, r, c, null), this.locale);
    const out = pivotOutput(read.source, pivotSpecOf(pivot, box), this.locale);
    console.debug(
      `[sheets engine] pivot sheet=${sheet.id} pivot=${pivot.id} rows=${out.rows.length} cols=${out.width}`,
    );
    if (out.rows.every((row) => row.every((x) => x.v === null))) return null;
    if (out.rows.length * out.width > PIVOT_OUTPUT_CELLS_MAX) return err('#REF!', PIVOT_TOO_LARGE);
    return pivotArray(out, read.formats);
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

  // A spill or a pivot table's output claims its rectangle (a pivot table's keeps even one cell, for its format), or
  // is an error in its words when it cannot land.
  protected claim(no: CellNo, sheet: Sheet, row: number, col: number, value: ValueArray): Value {
    const pivot = isPivotArray(value);
    const d = dims(value);
    if (d.rows === 0 || d.cols === 0) return err('#N/A', 'The result is empty');
    if (d.rows === 1 && d.cols === 1 && !pivot) return scalarOf(value.rows[0]![0]!);
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
      return err('#REF!', pivot ? PIVOT_PAST_EDGE : SPILL_PAST_EDGE);
    const blocker = this.spills.blocker(sheet, no, claim);
    if (blocker) return err('#REF!', pivot ? PIVOT_BLOCKED_BY(blocker) : spillBlockedBy(blocker));
    const readers = new Set<CellNo>();
    for (const cell of this.spills.place(no, claim))
      if (cell !== no)
        this.deps.readersOf(cell, sheetNo, this.nos.rowOf(cell), this.nos.colOf(cell), readers);
    // Whatever read these cells as empty before the spill reached them reads again.
    readers.delete(no);
    if (readers.size > 0) this.invalidate([...readers]);
    return value;
  }

  // Spend reads from the top-level read's budget: false once RECALC_READS_MAX is passed.
  private spend(n: number): boolean {
    this.reads += n;
    if (this.reads > RECALC_READS_MAX) {
      this.truncated = true;
      return false;
    }
    return true;
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

  protected resetAll(): void {
    if (this.forgotten) this.forgotten = null;
    this.nos = new CellNumbers();
    this.vals = new CellValues();
    this.deps = new Dependencies();
    this.spills = new Spills(this.nos);
    this.volatileCells.clear();
    this.cardReaders.clear();
    this.nowish.clear();
    this.importBook?.renumbered();
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

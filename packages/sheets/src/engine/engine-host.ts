// The Web Worker's side (docs/specs/029-sheets/formulas.md "Recalculation"): the only engine in the browser. It takes
// in the page's sheets and changes, tells the page which cells wait, and works them out in parts, sending each part's
// values. Pure and synchronous, so the Worker file only wires it to its messages and Node tests drive it directly.
import type { CardSource } from '../cards';
import { layoutIndex } from '../layout';
import { cellKey, type Sheet } from '../sheet';
import { sheetFromJson } from '../sheet-json';
import { SheetLimits } from '../sheet-limits';
import type { CellValue, EngineIn, EngineOut } from './engine-protocol';
import { Workbook, type CellAt } from './workbook';
import { pivotAnchorsOf } from '../pivot/pivot-resolve';

export class EngineHost {
  private wb: Workbook | null = null;
  private rev = 0;
  // Formula cells to work out and send, in order; \`next\` is the first not yet done.
  private queue: CellAt[] = [];
  private next = 0;
  private readonly post: (out: EngineOut) => void;
  private readonly clock: () => number;

  constructor(post: (out: EngineOut) => void, clock: () => number = () => performance.now()) {
    this.post = post;
    this.clock = clock;
  }

  receive(msg: EngineIn): void {
    this.rev = msg.rev;
    if (msg.t === 'load') {
      this.wb = new Workbook({
        sheets: msg.sheets.map(sheetFromJson),
        locale: msg.locale,
        ...(msg.timeZone ? { timeZone: msg.timeZone } : {}),
        ...(msg.meaning ? { meaning: msg.meaning } : {}),
        limits: msg.limits === 'spreadsheet' ? SheetLimits.spreadsheet : SheetLimits.plan,
        iteration: msg.iteration,
        ...(msg.functions ? { functions: msg.functions } : {}),
        trackForgotten: true,
        ...(msg.imports ? { imports: { access: msg.imports } } : {}),
      });
    } else {
      const wb = this.wb;
      if (!wb) return;
      if (msg.t === 'cells') {
        const sheet = wb.sheet(msg.sheetId);
        if (!sheet) return;
        const cells = sheet.cells.copy();
        const keys: string[] = [];
        for (const x of msg.cells) {
          const key = cellKey(x.r, x.c);
          keys.push(key);
          if (x.i || x.f) cells.setCell(x.r, x.c, x.i, x.f);
          else cells.delete(key);
        }
        wb.updateSheet({ ...sheet, cells }, keys);
      } else if (msg.t === 'sheet') wb.updateSheet(sheetFromJson(msg.sheet));
      else if (msg.t === 'remove') wb.removeSheet(msg.sheetId);
      else if (msg.t === 'order') wb.orderSheets(msg.sheetIds);
      else if (msg.t === 'iteration') wb.setIteration(msg.iteration);
      else if (msg.t === 'functions') wb.setFunctions(msg.functions);
      else if (msg.t === 'imported') wb.landImport(msg.key, msg.answer);
      else if (msg.t === 'imports-allowed') wb.allowImports();
      else if (msg.t === 'imports-online') wb.onlineImports(msg.allowed);
      else if (msg.t === 'imports-refresh') wb.refreshImports(msg.family);
      else wb.tick();
    }
    this.collect();
  }

  /** Plan cards changed (built from the page's items where the host runs): the formulas reading them wait. */
  setCards(cards: CardSource | null): void {
    if (!this.wb) return;
    this.wb.setCards(cards);
    this.collect();
  }

  /** Work out waiting cells for up to \`budgetMs\`, sending their values; whether any still wait. */
  work(budgetMs: number): boolean {
    const wb = this.wb;
    if (!wb) return false;
    const start = this.clock();
    const parts = new Map<string, CellValue[]>();
    // At least one cell a part, however small the budget.
    while (this.next < this.queue.length && (parts.size === 0 || this.clock() - start < budgetMs)) {
      const at = this.queue[this.next++]!;
      if (!wb.sheet(at.sheetId)) continue;
      let part = parts.get(at.sheetId);
      if (!part) {
        part = [];
        parts.set(at.sheetId, part);
      }
      part.push([at.r, at.c, wb.formulaResult(at.sheetId, at.r, at.c)]);
    }
    for (const [sheetId, cells] of parts) this.post({ t: 'values', rev: this.rev, sheetId, cells });
    // Working out may forget more (a spill landing on cells others read).
    this.collect();
    if (this.next < this.queue.length) return true;
    this.queue = [];
    this.next = 0;
    this.post({ t: 'settled', rev: this.rev });
    return false;
  }

  // Queue what the engine forgot, and tell the page those cells wait; and ask the page for imports.
  private collect(): void {
    const wb = this.wb!;
    const asks = wb.takeImportAsks();
    if (asks.length > 0) this.post({ t: 'imports', rev: this.rev, asks });
    const forgotten = wb.takeForgotten();
    if (forgotten === 'all') {
      this.queue = everyFormula(wb.sheetList());
      this.next = 0;
      this.post({ t: 'stale-all', rev: this.rev });
      return;
    }
    if (forgotten.length === 0) return;
    const bySheet = new Map<string, [number, number][]>();
    for (const at of forgotten) {
      this.queue.push(at);
      let cells = bySheet.get(at.sheetId);
      if (!cells) {
        cells = [];
        bySheet.set(at.sheetId, cells);
      }
      cells.push([at.r, at.c]);
    }
    for (const [sheetId, cells] of bySheet)
      this.post({ t: 'stale', rev: this.rev, sheetId, cells });
  }
}

// Every formula cell and every pivot table's anchor (pivot-tables.md "In the grid"): what a fresh start works out.
function everyFormula(sheets: readonly Sheet[]): CellAt[] {
  const out: CellAt[] = [];
  for (const sheet of sheets) {
    for (const { r, c } of pivotAnchorsOf(sheet))
      if (!sheet.cells.get(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!))?.input)
        out.push({ sheetId: sheet.id, r, c });
    const ix = layoutIndex(sheet.layout);
    for (const [key, cell] of sheet.cells) {
      if (!cell.input || !('f' in cell.input)) continue;
      const colon = key.indexOf(':');
      const r = ix.rowPos.get(key.slice(0, colon));
      const c = ix.colPos.get(key.slice(colon + 1));
      if (r !== undefined && c !== undefined) out.push({ sheetId: sheet.id, r, c });
    }
  }
  return out;
}

// The page's side (docs/specs/029-sheets/formulas.md "Recalculation"): its copy of the Worker's values, a WorkbookCopy
// that never works a formula out, kept current from the Worker's answers; and the messages that tell the Worker of
// each change. Values worked out before a sheet's rows or columns last moved are dropped: their positions are old.
import type { Sheet } from '../sheet';
import { cellToJson, sheetToJson } from '../sheet-json';
import { SheetLimits } from '../sheet-limits';
import type { ImportAccess, ImportAnswer, ImportAsk } from '../imports/import-request';
import type { FileMeaning } from '../formula/meaning';
import type { EngineIn, EngineOut } from './engine-protocol';
import type { ImportFamily } from './import-book';
import { ITERATION_OFF, type Iteration } from './loops';
import { WorkbookCopy } from './workbook-copy';

type PortOptions = {
  sheets: readonly Sheet[];
  locale: string;
  // A spreadsheet's time zone (formulas.md "Locale"); absent, the viewer's.
  timeZone?: string;
  // A spreadsheet's meaning (formulas.md, the file's meaning); absent, Google's.
  meaning?: FileMeaning;
  limits?: SheetLimits;
  iteration?: Iteration;
  // A spreadsheet's imports (imports.md): whether they may fetch, and who fetches what the Worker asks.
  imports?: { access: ImportAccess; ask: (asks: ImportAsk[]) => void };
  send: (msg: EngineIn) => void;
};

export class EnginePort {
  /** The page's copy: every reader reads it. */
  readonly copy: WorkbookCopy;
  private rev = 0;
  // The rev that last moved each sheet's positions (its load, its rows or columns).
  private readonly placed = new Map<string, number>();
  private readonly send: (msg: EngineIn) => void;
  private readonly imports: PortOptions['imports'];
  private readonly meaning: FileMeaning | undefined;

  constructor(opts: PortOptions) {
    this.send = opts.send;
    this.imports = opts.imports;
    this.meaning = opts.meaning;
    const limits = opts.limits ?? SheetLimits.plan;
    const iteration = opts.iteration ?? ITERATION_OFF;
    this.copy = new WorkbookCopy({
      sheets: opts.sheets,
      locale: opts.locale,
      ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
      limits,
      iteration,
    });
  }

  /** Send the Worker its sheets: once, when the page can hear its answers. */
  start(): void {
    const rev = ++this.rev;
    const sheets = this.copy.sheetList();
    for (const s of sheets) this.placed.set(s.id, rev);
    this.send({
      t: 'load',
      rev,
      sheets: sheets.map(sheetToJson),
      locale: this.copy.locale,
      ...(this.copy.timeZone ? { timeZone: this.copy.timeZone } : {}),
      ...(this.meaning ? { meaning: this.meaning } : {}),
      limits: this.copy.limits === SheetLimits.spreadsheet ? 'spreadsheet' : 'plan',
      iteration: this.copy.iterationSetting(),
      ...(this.imports ? { imports: this.imports.access } : {}),
    });
  }

  /** The page fetched an import the Worker asked for. */
  landImport(key: string, answer: ImportAnswer): void {
    this.send({ t: 'imported', rev: ++this.rev, key, answer });
  }

  /** An Editor allowed the spreadsheet's imports (for good: imports.md "Allow access"). */
  allowImports(): void {
    this.send({ t: 'imports-allowed', rev: ++this.rev });
  }

  /** The spreadsheet was synced to LiveDoc (imports.md "A spreadsheet in This Browser"). */
  onlineImports(allowed: boolean): void {
    this.send({ t: 'imports-online', rev: ++this.rev, allowed });
  }

  /** A family's time is up (the web's hour, IMPORTRANGE's minute): the Worker asks again for its imports still read. */
  refreshImports(family: ImportFamily): void {
    this.send({ t: 'imports-refresh', rev: ++this.rev, family });
  }

  /** A sheet changed: its cells (\`keys\`), or anything else about it when \`keys\` is undefined. */
  updateSheet(sheet: Sheet, keys?: readonly string[]): void {
    const before = this.copy.sheet(sheet.id);
    this.copy.updateSheet(sheet, keys);
    const rev = ++this.rev;
    if (!before || !keys || before.layout !== sheet.layout || before.title !== sheet.title) {
      this.placed.set(sheet.id, rev);
      this.send({ t: 'sheet', rev, sheet: sheetToJson(sheet) });
      return;
    }
    const cells = keys.map((key) => cellToJson(key, sheet.cells.get(key)));
    this.send({ t: 'cells', rev, sheetId: sheet.id, cells });
  }

  removeSheet(sheetId: string): void {
    this.copy.removeSheet(sheetId);
    this.placed.delete(sheetId);
    this.send({ t: 'remove', rev: ++this.rev, sheetId });
  }

  setIteration(iteration: Iteration): void {
    this.copy.setIteration(iteration);
    this.send({ t: 'iteration', rev: ++this.rev, iteration });
  }

  tick(): void {
    this.send({ t: 'tick', rev: ++this.rev });
  }

  /** An answer from the Worker. */
  receive(out: EngineOut): void {
    if (out.t === 'settled') return;
    if (out.t === 'imports') {
      this.imports?.ask(out.asks);
      return;
    }
    if (out.t === 'stale-all') {
      this.copy.markAllStale();
      return;
    }
    if (out.rev < (this.placed.get(out.sheetId) ?? Infinity)) return;
    if (out.t === 'stale')
      this.copy.markStale(out.cells.map(([r, c]) => ({ sheetId: out.sheetId, r, c })));
    else for (const [r, c, v] of out.cells) this.copy.acceptValue(out.sheetId, r, c, v);
  }
}

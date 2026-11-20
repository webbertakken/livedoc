// Where arrays spill (docs/specs/029-sheets/formulas.md "Arrays and spills"): the formulas that may spill, per sheet,
// and the rectangles their arrays claim, by cell number. The workbook works the formulas out; this holds who owns
// which cell, and whether a sheet's spills are all known so its empty cells read their claims straight away.
import { formatA1 } from '../address';
import { storedAst } from '../formula/stored';
import { layoutIndex } from '../layout';
import { cellKey, type CellInput, type Sheet } from '../sheet';
import type { CellNo, CellNumbers } from './cell-numbers';
import { maySpill } from './spill-shape';

/** The rectangle a spilling formula fills, its own cell at the top left. */
export type Claim = { sheetId: string; r1: number; c1: number; r2: number; c2: number };

// Google's words for a spill that cannot land.
export const SPILL_PAST_EDGE =
  'Array result was not expanded because it would run past the edge of the sheet.';
export const spillBlockedBy = (a1: string) =>
  `Array result was not expanded because it would overwrite data in ${a1}.`;

export function inputMaySpill(input: CellInput | undefined): boolean {
  if (!input || !('f' in input)) return false;
  const ast = storedAst(input.f);
  return !!ast && maySpill(ast, input.f.r);
}

export class Spills {
  private readonly claims = new Map<CellNo, Claim>();
  private readonly owners = new Map<CellNo, CellNo>();
  private readonly spillers = new Map<string, Set<CellNo>>();
  private readonly ready = new Set<string>();

  private readonly nos: CellNumbers;

  constructor(nos: CellNumbers) {
    this.nos = nos;
  }

  /** Index every formula of the sheets that may spill. */
  indexAll(sheets: Iterable<Sheet>): void {
    for (const sheet of sheets)
      for (const [key, cell] of sheet.cells) {
        if (!inputMaySpill(cell.input)) continue;
        const ix = layoutIndex(sheet.layout);
        const colon = key.indexOf(':');
        const r = ix.rowPos.get(key.slice(0, colon));
        const c = ix.colPos.get(key.slice(colon + 1));
        if (r !== undefined && c !== undefined)
          this.spillersOf(sheet.id).add(this.nos.intern(this.nos.sheetNo(sheet.id), r, c));
      }
  }

  /** A cell of a sheet changed: index it as a spiller or not. */
  index(sheet: Sheet, key: string, no: CellNo): void {
    if (inputMaySpill(sheet.cells.get(key)?.input)) {
      this.spillersOf(sheet.id).add(no);
      this.ready.delete(sheet.id);
    } else {
      this.spillers.get(sheet.id)?.delete(no);
    }
  }

  /** The formulas of a sheet that may spill. */
  spillersIn(sheetId: string): ReadonlySet<CellNo> | undefined {
    return this.spillers.get(sheetId);
  }

  isReady(sheetId: string): boolean {
    return this.ready.has(sheetId);
  }

  markReady(sheetId: string): void {
    this.ready.add(sheetId);
  }

  /** A sheet's spills are to be worked out again. */
  unready(sheetId: string): void {
    this.ready.delete(sheetId);
  }

  /** The formula whose spill covers a cell (its own cell included). */
  ownerAt(no: CellNo): CellNo | undefined {
    return this.owners.get(no);
  }

  claimOf(owner: CellNo): Claim | undefined {
    return this.claims.get(owner);
  }

  /** The first cell of the rectangle that holds an input or another's spill, as A1; null when it may land. */
  blocker(sheet: Sheet, owner: CellNo, claim: Claim): string | null {
    const sheetNo = this.nos.sheetNo(sheet.id);
    for (let r = claim.r1; r <= claim.r2; r++)
      for (let c = claim.c1; c <= claim.c2; c++) {
        if (r === claim.r1 && c === claim.c1) continue;
        const other = this.owners.get(this.nos.find(sheetNo, r, c));
        if (other !== undefined && other !== owner) return formatA1(r, c);
        if (sheet.cells.get(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!))?.input)
          return formatA1(r, c);
      }
    return null;
  }

  /** Claim a rectangle for its owner; the cells it covers, by number, in rows. */
  place(owner: CellNo, claim: Claim): CellNo[] {
    const sheetNo = this.nos.sheetNo(claim.sheetId);
    const cells: CellNo[] = [];
    for (let r = claim.r1; r <= claim.r2; r++)
      for (let c = claim.c1; c <= claim.c2; c++) {
        const cell = this.nos.intern(sheetNo, r, c);
        this.owners.set(cell, owner);
        cells.push(cell);
      }
    this.claims.set(owner, claim);
    return cells;
  }

  /** Give up an owner's rectangle; what it was. */
  release(owner: CellNo): Claim | undefined {
    const claim = this.claims.get(owner);
    if (!claim) return undefined;
    const sheetNo = this.nos.sheetNo(claim.sheetId);
    for (let r = claim.r1; r <= claim.r2; r++)
      for (let c = claim.c1; c <= claim.c2; c++) {
        const cell = this.nos.find(sheetNo, r, c);
        if (this.owners.get(cell) === owner) this.owners.delete(cell);
      }
    this.claims.delete(owner);
    return claim;
  }

  private spillersOf(sheetId: string): Set<CellNo> {
    let set = this.spillers.get(sheetId);
    if (!set) {
      set = new Set();
      this.spillers.set(sheetId, set);
    }
    return set;
  }
}

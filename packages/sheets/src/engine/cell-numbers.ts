// The engine's cells by number (docs/specs/029-sheets/formulas.md "Recalculation"): each cell the engine works out
// or reads one by one gets a dense integer, found by its sheet and position through an open-addressing table held in
// typed arrays, so values and dependencies are held in columns indexed by it rather than in maps keyed by strings.
// Positions stay put while numbers live: any change of a sheet's rows or columns starts the engine afresh.

/** A cell's number in the engine: 1 and up; 0 is no cell. */
export type CellNo = number;

/** No cell: what `find` answers for a cell never numbered, and the reader of a formula no cell keeps (a rule). */
export const NO_CELL: CellNo = 0;

const CELLS_FIRST = 1 << 10;

/** An Int32Array holding `arr` with room for index `at`, doubled as it grows. */
export function grownInt32(arr: Int32Array<ArrayBuffer>, at: number): Int32Array<ArrayBuffer> {
  if (at < arr.length) return arr;
  let size = arr.length;
  while (size <= at) size *= 2;
  const next = new Int32Array(size);
  next.set(arr);
  return next;
}

export class CellNumbers {
  private readonly sheetIds: string[] = [];
  private readonly sheetNos = new Map<string, number>();
  private sheetCol = new Int32Array(CELLS_FIRST);
  private rowCol = new Int32Array(CELLS_FIRST);
  private colCol = new Int32Array(CELLS_FIRST);
  // Open addressing, linear probing; each slot a CellNo or 0. Kept under half full.
  private table = new Int32Array(CELLS_FIRST * 2);
  private next = 1;

  /** One past the highest number given: the length every column indexed by CellNo must reach. */
  get size(): number {
    return this.next;
  }

  /** A sheet's own small number, given on first sight. */
  sheetNo(sheetId: string): number {
    let n = this.sheetNos.get(sheetId);
    if (n === undefined) {
      n = this.sheetIds.length;
      this.sheetIds.push(sheetId);
      this.sheetNos.set(sheetId, n);
    }
    return n;
  }

  sheetIdOf(no: CellNo): string {
    return this.sheetIds[this.sheetCol[no]!]!;
  }

  sheetNoOf(no: CellNo): number {
    return this.sheetCol[no]!;
  }

  rowOf(no: CellNo): number {
    return this.rowCol[no]!;
  }

  colOf(no: CellNo): number {
    return this.colCol[no]!;
  }

  /** The number of a cell, or NO_CELL when it has none yet. */
  find(sheetNo: number, r: number, c: number): CellNo {
    const mask = this.table.length - 1;
    for (let i = hash(sheetNo, r, c) & mask; ; i = (i + 1) & mask) {
      const no = this.table[i]!;
      if (no === NO_CELL) return NO_CELL;
      if (this.rowCol[no] === r && this.colCol[no] === c && this.sheetCol[no] === sheetNo)
        return no;
    }
  }

  /** The number of a cell, given on first sight. */
  intern(sheetNo: number, r: number, c: number): CellNo {
    const mask = this.table.length - 1;
    let i = hash(sheetNo, r, c) & mask;
    for (; ; i = (i + 1) & mask) {
      const no = this.table[i]!;
      if (no === NO_CELL) break;
      if (this.rowCol[no] === r && this.colCol[no] === c && this.sheetCol[no] === sheetNo)
        return no;
    }
    const no = this.next++;
    this.sheetCol = grownInt32(this.sheetCol, no);
    this.rowCol = grownInt32(this.rowCol, no);
    this.colCol = grownInt32(this.colCol, no);
    this.sheetCol[no] = sheetNo;
    this.rowCol[no] = r;
    this.colCol[no] = c;
    this.table[i] = no;
    if (this.next * 2 > this.table.length) this.rehash();
    return no;
  }

  private rehash(): void {
    const table = new Int32Array(this.table.length * 2);
    const mask = table.length - 1;
    for (let no = 1; no < this.next; no++) {
      let i = hash(this.sheetCol[no]!, this.rowCol[no]!, this.colCol[no]!) & mask;
      while (table[i] !== NO_CELL) i = (i + 1) & mask;
      table[i] = no;
    }
    this.table = table;
  }
}

function hash(sheetNo: number, r: number, c: number): number {
  const h =
    Math.imul(r, 0x9e3779b1) ^ Math.imul(c + 1, 0x85ebca77) ^ Math.imul(sheetNo + 1, 0xc2b2ae3d);
  return (h ^ (h >>> 15)) >>> 0;
}

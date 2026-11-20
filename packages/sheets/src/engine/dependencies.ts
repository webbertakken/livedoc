// Who reads what: recorded while a formula is worked out, so INDIRECT and OFFSET are tracked as they are read
// (docs/specs/029-sheets/formulas.md "Recalculation"). Everything is held by cell number in typed columns: a read of
// one cell is an edge on two linked lists (the reader's reads, the cell's readers), a read of a range a record
// listed under each of its sheet's columns, so the readers of one changed cell are found without scanning every
// formula. A forgotten range stays listed, skipped, until its column is tidied; its record is reused only then.
import { grownInt32, NO_CELL, type CellNo } from './cell-numbers';

const FIRST = 1 << 10;
const DEAD = -1;

// The ranges listed under one column: their numbers, how many are listed, and how many of those are forgotten.
type ColumnList = { ids: Int32Array<ArrayBuffer>; n: number; dead: number };

export class Dependencies {
  // Edges, numbered from 1 (0 ends a list): the reader, the cell read, the reader's next read, the cell's next and
  // previous reader. Freed edges are chained on eNextOut.
  private eReader = new Int32Array(FIRST);
  private eCell = new Int32Array(FIRST);
  private eNextOut = new Int32Array(FIRST);
  private eNextIn = new Int32Array(FIRST);
  private ePrevIn = new Int32Array(FIRST);
  private edges = 1;
  private freeEdge = 0;
  // By cell number: its first read (as a reader), its first reader (as a cell), its first range read.
  private outHead = new Int32Array(FIRST);
  private inHead = new Int32Array(FIRST);
  private rangeHead = new Int32Array(FIRST);
  // Ranges, numbered from 1: the reader (DEAD once forgotten), its sheet, rows and columns, the reader's next range,
  // and how many column lists still hold it. Freed ranges are chained on rNext.
  private rReader = new Int32Array(FIRST);
  private rSheet = new Int32Array(FIRST);
  private rR1 = new Int32Array(FIRST);
  private rR2 = new Int32Array(FIRST);
  private rC1 = new Int32Array(FIRST);
  private rC2 = new Int32Array(FIRST);
  private rNext = new Int32Array(FIRST);
  private rHeld = new Int32Array(FIRST);
  private ranges = 1;
  private freeRange = 0;
  // sheet number -> column position -> the ranges reading it.
  private readonly byCol = new Map<number, Map<number, ColumnList>>();

  noteCell(reader: CellNo, cell: CellNo): void {
    this.outHead = grownInt32(this.outHead, reader);
    // A formula reading one cell again and again in a row notes it once.
    const last = this.outHead[reader]!;
    if (last !== 0 && this.eCell[last] === cell) return;
    const e = this.newEdge();
    this.inHead = grownInt32(this.inHead, cell);
    this.eReader[e] = reader;
    this.eCell[e] = cell;
    this.eNextOut[e] = this.outHead[reader]!;
    this.outHead[reader] = e;
    const first = this.inHead[cell]!;
    this.eNextIn[e] = first;
    this.ePrevIn[e] = 0;
    if (first !== 0) this.ePrevIn[first] = e;
    this.inHead[cell] = e;
  }

  noteRange(reader: CellNo, sheetNo: number, r1: number, c1: number, r2: number, c2: number): void {
    const n = this.newRange();
    this.rangeHead = grownInt32(this.rangeHead, reader);
    this.rReader[n] = reader;
    this.rSheet[n] = sheetNo;
    this.rR1[n] = r1;
    this.rR2[n] = r2;
    this.rC1[n] = c1;
    this.rC2[n] = c2;
    this.rNext[n] = this.rangeHead[reader]!;
    this.rHeld[n] = c2 - c1 + 1;
    this.rangeHead[reader] = n;
    let cols = this.byCol.get(sheetNo);
    if (!cols) {
      cols = new Map();
      this.byCol.set(sheetNo, cols);
    }
    for (let c = c1; c <= c2; c++) {
      let list = cols.get(c);
      if (!list) {
        list = { ids: new Int32Array(8), n: 0, dead: 0 };
        cols.set(c, list);
      }
      list.ids = grownInt32(list.ids, list.n);
      list.ids[list.n++] = n;
    }
  }

  /** Forget what a reader read (before it is worked out again). */
  clear(reader: CellNo): void {
    if (reader < this.outHead.length) {
      for (let e = this.outHead[reader]!; e !== 0;) {
        const next = this.eNextOut[e]!;
        this.unlinkIn(e);
        this.eNextOut[e] = this.freeEdge;
        this.freeEdge = e;
        e = next;
      }
      this.outHead[reader] = 0;
    }
    if (reader < this.rangeHead.length) {
      for (let n = this.rangeHead[reader]!; n !== 0;) {
        const next = this.rNext[n]!;
        this.rReader[n] = DEAD;
        const cols = this.byCol.get(this.rSheet[n]!)!;
        for (let c = this.rC1[n]!; c <= this.rC2[n]!; c++) {
          const list = cols.get(c)!;
          list.dead++;
          if (list.dead * 2 > list.n) this.tidy(list);
        }
        n = next;
      }
      this.rangeHead[reader] = 0;
    }
  }

  /** Add to `out` the readers of a cell, by its number (NO_CELL when it has none) and its position. */
  readersOf(cell: CellNo, sheetNo: number, r: number, c: number, out: Set<CellNo>): void {
    if (cell !== NO_CELL && cell < this.inHead.length)
      for (let e = this.inHead[cell]!; e !== 0; e = this.eNextIn[e]!) out.add(this.eReader[e]!);
    const list = this.byCol.get(sheetNo)?.get(c);
    if (!list) return;
    for (let i = 0; i < list.n; i++) {
      const n = list.ids[i]!;
      if (r >= this.rR1[n]! && r <= this.rR2[n]! && this.rReader[n] !== DEAD)
        out.add(this.rReader[n]!);
    }
  }

  // Drop a column's forgotten ranges; a range out of every column it was listed under is free for reuse.
  private tidy(list: ColumnList): void {
    let kept = 0;
    for (let i = 0; i < list.n; i++) {
      const n = list.ids[i]!;
      if (this.rReader[n] !== DEAD) list.ids[kept++] = n;
      else if (--this.rHeld[n]! === 0) {
        this.rNext[n] = this.freeRange;
        this.freeRange = n;
      }
    }
    list.n = kept;
    list.dead = 0;
  }

  private unlinkIn(e: number): void {
    const cell = this.eCell[e]!;
    const prev = this.ePrevIn[e]!;
    const next = this.eNextIn[e]!;
    if (prev === 0) this.inHead[cell] = next;
    else this.eNextIn[prev] = next;
    if (next !== 0) this.ePrevIn[next] = prev;
  }

  private newEdge(): number {
    if (this.freeEdge !== 0) {
      const e = this.freeEdge;
      this.freeEdge = this.eNextOut[e]!;
      return e;
    }
    const e = this.edges++;
    if (e >= this.eReader.length) {
      this.eReader = grownInt32(this.eReader, e);
      this.eCell = grownInt32(this.eCell, e);
      this.eNextOut = grownInt32(this.eNextOut, e);
      this.eNextIn = grownInt32(this.eNextIn, e);
      this.ePrevIn = grownInt32(this.ePrevIn, e);
    }
    return e;
  }

  private newRange(): number {
    if (this.freeRange !== 0) {
      const n = this.freeRange;
      this.freeRange = this.rNext[n]!;
      return n;
    }
    const n = this.ranges++;
    if (n >= this.rReader.length) {
      this.rReader = grownInt32(this.rReader, n);
      this.rSheet = grownInt32(this.rSheet, n);
      this.rR1 = grownInt32(this.rR1, n);
      this.rR2 = grownInt32(this.rR2, n);
      this.rC1 = grownInt32(this.rC1, n);
      this.rC2 = grownInt32(this.rC2, n);
      this.rNext = grownInt32(this.rNext, n);
      this.rHeld = grownInt32(this.rHeld, n);
    }
    return n;
  }
}

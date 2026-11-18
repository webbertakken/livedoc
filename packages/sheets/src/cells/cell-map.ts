// A sheet's cells (docs/specs/029-sheets/sheet-store.md "What a sheet is"), held compactly
// (docs/specs/029-sheets/performance.md "Held in memory"): a Map of cell key (`rowId:colId`) to cell, so every
// reader keeps its interface, over typed columns of slots, an index of slots and interned ids, styles and formula
// texts. `copy()` is the next version of a sheet: it shares every page, so a write costs what it touches.
import { CellInterns } from './cell-interns';
import { CellSlots, SlotKind, type SlotValue } from './cell-slots';
import { SlotIndex } from './slot-index';
import type { Cell, CellFormat, CellInput, StoredFormula } from '../sheet';

// The smallest index; an index is sized to four times its cells when made afresh, so it fills to half before the
// next.
const INDEX_MIN = 64;
// Slots of deleted cells kept before the slots are compacted: never more than the live ones (and a page's worth).
const DEAD_MIN = 4096;

function sizeFor(cells: number): number {
  let capacity = INDEX_MIN;
  while (capacity < cells * 4) capacity *= 2;
  return capacity;
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

// How many keys an object has, without making their list (a load checks every cell).
function ownKeys(o: object): number {
  let n = 0;
  for (const key in o) if (Object.hasOwn(o, key)) n++;
  return n;
}

// A cell the slots can hold: no input or one of the four, and no format or a format object. Anything else comes
// from a request not yet validated, and is held as given (SlotKind.Other).
function ofCellShape(cell: unknown): cell is Cell {
  return isObject(cell) && ofParts(cell.input, cell.format);
}

function ofParts(input: unknown, format: unknown): boolean {
  if (format !== undefined && !isObject(format)) return false;
  if (input === undefined) return true;
  if (!isObject(input)) return false;
  if (ownKeys(input) !== 1) return false;
  if (typeof input.n === 'number') return true;
  if (typeof input.s === 'string') return true;
  if (typeof input.b === 'boolean') return true;
  const f = input.f;
  return (
    isObject(f) &&
    ownKeys(f) === 2 &&
    typeof f.t === 'string' &&
    Array.isArray(f.r) &&
    f.r.every(isObject)
  );
}

function splitKey(key: string): [string, string] | null {
  const i = key.indexOf(':');
  return i < 0 ? null : [key.slice(0, i), key.slice(i + 1)];
}

export class CellMap implements Map<string, Cell> {
  readonly [Symbol.toStringTag] = 'CellMap';
  private slots: CellSlots;
  private index: SlotIndex;
  private interns: CellInterns;
  private live = 0;
  private dead = 0;
  private readonly encoding: SlotValue = {
    kind: SlotKind.Blank,
    num: 0,
    row: 0,
    col: 0,
    style: 0,
    boxed: undefined,
    packed: null,
  };

  constructor(entries?: Iterable<readonly [string, Cell]> | null) {
    this.slots = new CellSlots();
    this.index = SlotIndex.sized(INDEX_MIN);
    this.interns = new CellInterns();
    if (entries) for (const [key, cell] of entries) this.set(key, cell);
  }

  /** An empty store with room for `cells` before its index grows (a load knows how many it reads). */
  static sized(cells: number): CellMap {
    const map = new CellMap();
    map.index = SlotIndex.sized(sizeFor(cells));
    return map;
  }

  /** Cells from entries, as `new Map(entries)` would hold them. */
  static from(entries: Iterable<readonly [string, Cell]>): CellMap {
    return new CellMap(entries);
  }

  /** The next version: the same cells, sharing every page until either writes to it. */
  copy(): CellMap {
    const out = new CellMap();
    out.slots = this.slots.copy();
    out.index = this.index.copy();
    out.interns = this.interns;
    out.live = this.live;
    out.dead = this.dead;
    return out;
  }

  get size(): number {
    return this.live;
  }

  get(key: string): Cell | undefined {
    const slot = this.slotOf(key);
    return slot < 0 ? undefined : this.cellAt(slot);
  }

  has(key: string): boolean {
    return this.slotOf(key) >= 0;
  }

  set(key: string, cell: Cell): this {
    const parts = splitKey(key);
    if (!parts) throw new RangeError(`not a cell key: ${key}`);
    const row = this.interns.rows.intern(parts[0]);
    const col = this.interns.cols.intern(parts[1]);
    if (!ofCellShape(cell)) return this.put(row, col, this.other(row, col, cell));
    return this.put(row, col, this.encode(row, col, cell.input, cell.format));
  }

  /**
   * As `set`, by row id and column id and the cell's parts: no key made and split again, no cell object made (a load
   * of every cell).
   */
  setCell(rowId: string, colId: string, input: CellInput | undefined, format?: CellFormat): this {
    const row = this.interns.rows.intern(rowId);
    const col = this.interns.cols.intern(colId);
    return this.put(row, col, this.encode(row, col, input, format));
  }

  private put(row: number, col: number, value: SlotValue): this {
    const slot = this.index.find(row, col, this.slots);
    if (slot >= 0) {
      this.slots.write(slot, value);
      return this;
    }
    if (!this.index.hasRoom) this.rebuild(this.live + 1);
    this.index.insert(row, col, this.slots.append(value));
    this.live++;
    return this;
  }

  delete(key: string): boolean {
    const parts = splitKey(key);
    const row = parts ? this.interns.rows.find(parts[0]) : undefined;
    const col = parts ? this.interns.cols.find(parts[1]) : undefined;
    if (row === undefined || col === undefined) return false;
    const slot = this.index.remove(row, col, this.slots);
    if (slot < 0) return false;
    this.slots.kill(slot);
    this.live--;
    this.dead++;
    if (this.dead > Math.max(this.live, DEAD_MIN)) this.rebuild(this.live);
    return true;
  }

  clear(): void {
    this.slots = new CellSlots();
    this.index = SlotIndex.sized(INDEX_MIN);
    this.live = 0;
    this.dead = 0;
  }

  forEach(fn: (cell: Cell, key: string, map: Map<string, Cell>) => void, thisArg?: unknown): void {
    for (const [key, cell] of this.entries()) fn.call(thisArg, cell, key, this);
  }

  *keys(): MapIterator<string> {
    for (let slot = 0; slot < this.slots.length; slot++) {
      if (this.slots.kind(slot) !== SlotKind.Dead) yield this.keyAt(slot);
    }
  }

  *values(): MapIterator<Cell> {
    for (let slot = 0; slot < this.slots.length; slot++) {
      if (this.slots.kind(slot) !== SlotKind.Dead) yield this.cellAt(slot);
    }
  }

  *entries(): MapIterator<[string, Cell]> {
    for (let slot = 0; slot < this.slots.length; slot++) {
      if (this.slots.kind(slot) !== SlotKind.Dead) yield [this.keyAt(slot), this.cellAt(slot)];
    }
  }

  [Symbol.iterator](): MapIterator<[string, Cell]> {
    return this.entries();
  }

  private slotOf(key: string): number {
    const parts = splitKey(key);
    if (!parts) return -1;
    const row = this.interns.rows.find(parts[0]);
    const col = row === undefined ? undefined : this.interns.cols.find(parts[1]);
    return col === undefined ? -1 : this.index.find(row!, col, this.slots);
  }

  private keyAt(slot: number): string {
    return `${this.interns.rows.ids[this.slots.row(slot)]}:${this.interns.cols.ids[this.slots.col(slot)]}`;
  }

  private cellAt(slot: number): Cell {
    if (this.slots.kind(slot) === SlotKind.Other) return this.slots.boxed(slot) as Cell;
    const input = this.inputAt(slot);
    const format = this.interns.styleAt(this.slots.style(slot));
    if (input === undefined) return format === undefined ? {} : { format };
    return format === undefined ? { input } : { input, format };
  }

  private inputAt(slot: number): CellInput | undefined {
    switch (this.slots.kind(slot)) {
      case SlotKind.Number:
        return { n: this.slots.num(slot) };
      case SlotKind.Text:
        return { s: this.slots.boxed(slot) as string };
      case SlotKind.True:
        return { b: true };
      case SlotKind.False:
        return { b: false };
      case SlotKind.Formula:
        return { f: this.interns.unpack(this.slots.packed(slot)) };
      case SlotKind.HeldFormula:
        return { f: this.slots.boxed(slot) as StoredFormula };
      default:
        return undefined;
    }
  }

  // A cell held as given (SlotKind.Other).
  private other(row: number, col: number, cell: unknown): SlotValue {
    const value = this.blank(row, col);
    value.kind = SlotKind.Other;
    value.boxed = cell;
    return value;
  }

  // One value used again by every write, as the slots copy it at once.
  private blank(row: number, col: number): SlotValue {
    const value = this.encoding;
    value.kind = SlotKind.Blank;
    value.row = row;
    value.col = col;
    value.num = 0;
    value.style = 0;
    value.boxed = undefined;
    value.packed = null;
    return value;
  }

  private encode(
    row: number,
    col: number,
    input: CellInput | undefined,
    format: CellFormat | undefined,
  ): SlotValue {
    if (!ofParts(input, format)) {
      const cell =
        input === undefined ? { format } : format === undefined ? { input } : { input, format };
      return this.other(row, col, cell);
    }
    const value = this.blank(row, col);
    value.style = this.interns.style(format);
    if (!input) return value;
    if ('n' in input) {
      value.kind = SlotKind.Number;
      value.num = input.n;
    } else if ('s' in input) {
      value.kind = SlotKind.Text;
      value.boxed = input.s;
    } else if ('b' in input) {
      value.kind = input.b ? SlotKind.True : SlotKind.False;
    } else {
      const held = this.interns.formula(input.f);
      if (Array.isArray(held)) {
        value.kind = SlotKind.Formula;
        value.packed = held;
      } else {
        value.kind = SlotKind.HeldFormula;
        value.boxed = held;
      }
    }
    return value;
  }

  // Slots and index made afresh for `cells` live cells, in the order they were first written, the dead dropped.
  private rebuild(cells: number): void {
    const slots = new CellSlots();
    const index = SlotIndex.sized(sizeFor(cells));
    for (let slot = 0; slot < this.slots.length; slot++) {
      const kind = this.slots.kind(slot);
      if (kind === SlotKind.Dead) continue;
      const row = this.slots.row(slot);
      const col = this.slots.col(slot);
      const value = { kind, num: this.slots.num(slot), row, col, style: this.slots.style(slot) };
      const packed = kind === SlotKind.Formula ? this.slots.packed(slot) : null;
      index.insert(row, col, slots.append({ ...value, boxed: this.slots.boxed(slot), packed }));
    }
    this.slots = slots;
    this.index = index;
    this.dead = 0;
  }
}

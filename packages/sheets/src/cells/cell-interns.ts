// What a sheet's cells name over and over, held once (docs/specs/029-sheets/performance.md "Held in memory"): row
// and column ids as small integers, formats, and formula texts (a formula's shape). Shared by every version of the
// sheet and only ever added to, so a version made before an id was added never meets it.
import type { CellFormat, StoredFormula, StoredRef } from '../sheet';
import { CellStyle } from '../workbook/cell-style';

class Axis {
  readonly ids: string[] = [];
  private readonly index = new Map<string, number>();
  private lastId: string | undefined;
  private lastN = 0;

  find(id: string): number | undefined {
    return this.index.get(id);
  }

  intern(id: string): number {
    // A row's cells, and the references of a filled column, name the same id one after another.
    if (id === this.lastId) return this.lastN;
    let n = this.index.get(id);
    if (n === undefined) {
      n = this.ids.length;
      this.ids.push(id);
      this.index.set(id, n);
    }
    this.lastId = id;
    this.lastN = n;
    return n;
  }
}

// A formula packed as small integers: its shape, then for each reference a mask of the parts it has (PARTS, bit by
// index) and those parts, ids interned. Only a formula whose references are all plain packs (./cell-map holds any
// other as given): about a third of the bytes of its objects.
export type PackedFormula = number[];

const PARTS = ['r1', 'c1', 'r2', 'c2', 'a'] as const;
const PLAIN = new Set<string>(PARTS);
// The absolute bits (StoredRef.a): four.
const ABSOLUTE_MAX = 15;

// A reference to this sheet by ids, with nothing but its corners and absolute bits.
function isPlain(ref: StoredRef): boolean {
  for (const key of Object.keys(ref)) {
    if (!PLAIN.has(key)) return false;
    const value = (ref as Record<string, unknown>)[key];
    if (
      key === 'a'
        ? !Number.isInteger(value) || (value as number) < 0 || (value as number) > ABSOLUTE_MAX
        : typeof value !== 'string'
    )
      return false;
  }
  return true;
}

export class CellInterns {
  readonly rows = new Axis();
  readonly cols = new Axis();
  // Style 0 is none; the rest frozen, as every cell holding one shares it.
  private readonly styles: (CellFormat | undefined)[] = [undefined];
  private readonly styleIndex = new Map<string, number>();
  // Formula texts, each a shape (docs/specs/029-sheets/performance.md "Held in memory").
  private readonly shapes: string[] = [];
  private readonly shapeIndex = new Map<string, number>();
  private readonly packing: PackedFormula = [];

  style(format: CellFormat | undefined): number {
    if (format === undefined) return 0;
    const key = CellStyle.keyOf(format);
    let n = this.styleIndex.get(key);
    if (n === undefined) {
      n = this.styles.length;
      this.styles.push(Object.freeze(CellStyle.canonical(format)));
      this.styleIndex.set(key, n);
    }
    return n;
  }

  styleAt(n: number): CellFormat | undefined {
    return this.styles[n];
  }

  /**
   * A formula as the slots hold it: packed when each of its references is plain, else as given. The packed integers
   * are one array used again by the next call, so they are copied into a page before then (a load packs millions).
   */
  formula(f: StoredFormula): Readonly<PackedFormula> | StoredFormula {
    const packed = this.packing;
    packed.length = 0;
    packed.push(this.shape(f.t));
    for (const ref of f.r) {
      if (!isPlain(ref)) return f;
      let mask = 0;
      const at = packed.push(0) - 1;
      for (let part = 0; part < PARTS.length; part++) {
        const key = PARTS[part]!;
        const value = ref[key];
        if (value === undefined) continue;
        mask |= 1 << part;
        packed.push(
          key === 'a'
            ? (value as number)
            : (key[0] === 'r' ? this.rows : this.cols).intern(value as string),
        );
      }
      packed[at] = mask;
    }
    return packed;
  }

  /** The stored formula a packed one holds. */
  unpack(packed: ArrayLike<number>): StoredFormula {
    const r: StoredRef[] = [];
    let i = 1;
    while (i < packed.length) {
      const mask = packed[i++]!;
      const ref: StoredRef = {};
      for (let part = 0; part < PARTS.length; part++) {
        if ((mask & (1 << part)) === 0) continue;
        const key = PARTS[part]!;
        const value = packed[i++]!;
        if (key === 'a') ref.a = value;
        else ref[key] = (key[0] === 'r' ? this.rows : this.cols).ids[value]!;
      }
      r.push(ref);
    }
    return { t: this.shapes[packed[0]!]!, r };
  }

  private shape(t: string): number {
    let n = this.shapeIndex.get(t);
    if (n === undefined) {
      n = this.shapes.length;
      this.shapes.push(t);
      this.shapeIndex.set(t, n);
    }
    return n;
  }
}

// The values the engine has worked out, by cell number (docs/specs/029-sheets/formulas.md "Recalculation"): a kind
// byte and a number in typed columns, and text, errors and arrays beside them, so a formula giving a number holds
// nine bytes and no object.
import type { Value } from '../formula/values';
import type { CellNo } from './cell-numbers';

const UNSET = 0;
const NUMBER = 1;
const TRUE = 2;
const FALSE = 3;
const EMPTY = 4;
const OTHER = 5;

const FIRST = 1 << 10;

export class CellValues {
  private kind = new Uint8Array(FIRST);
  private num = new Float64Array(FIRST);
  private readonly other = new Map<CellNo, Value>();

  has(no: CellNo): boolean {
    return no < this.kind.length && this.kind[no] !== UNSET;
  }

  /** A worked-out value, or undefined when there is none. */
  get(no: CellNo): Value | undefined {
    if (no >= this.kind.length) return undefined;
    switch (this.kind[no]) {
      case NUMBER:
        return this.num[no]!;
      case TRUE:
        return true;
      case FALSE:
        return false;
      case EMPTY:
        return null;
      case OTHER:
        return this.other.get(no);
      default:
        return undefined;
    }
  }

  set(no: CellNo, value: Value): void {
    this.grow(no);
    if (this.kind[no] === OTHER) this.other.delete(no);
    if (typeof value === 'number') {
      this.kind[no] = NUMBER;
      this.num[no] = value;
    } else if (typeof value === 'boolean') this.kind[no] = value ? TRUE : FALSE;
    else if (value === null) this.kind[no] = EMPTY;
    else {
      this.kind[no] = OTHER;
      this.other.set(no, value);
    }
  }

  /** Forget a value; whether there was one. */
  delete(no: CellNo): boolean {
    if (!this.has(no)) return false;
    if (this.kind[no] === OTHER) this.other.delete(no);
    this.kind[no] = UNSET;
    return true;
  }

  private grow(no: CellNo): void {
    if (no < this.kind.length) return;
    let size = this.kind.length;
    while (size <= no) size *= 2;
    const kind = new Uint8Array(size);
    kind.set(this.kind);
    const num = new Float64Array(size);
    num.set(this.num);
    this.kind = kind;
    this.num = num;
  }
}

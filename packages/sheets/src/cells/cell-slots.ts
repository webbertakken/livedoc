// A sheet's filled cells as slots in typed columns (docs/specs/029-sheets/performance.md "Held in memory").
// Slots sit in pages of PAGE_SLOTS; a copy shares every page, and a page is copied only when one of its versions
// writes to it (copy on write), so the next version of a sheet costs the pages its write touched, not the sheet.

/** What a slot holds; `Dead` is a deleted cell's slot, skipped until the slots are compacted. */
export const SlotKind = {
  Dead: 0,
  Number: 1,
  Text: 2,
  True: 3,
  False: 4,
  // A formula packed as integers (CellInterns.formula) in its page's pool; `num` is where.
  Formula: 5,
  // A cell with a format and no input.
  Blank: 6,
  // A cell not of a cell's shape (from a request, before it is validated): held as given, so validation sees it.
  Other: 7,
  // A formula that does not pack, held as given.
  HeldFormula: 8,
} as const;
export type SlotKind = (typeof SlotKind)[keyof typeof SlotKind];

// 4,096 slots a page: about 116 KB to copy on a page's first write in a version, a few microseconds.
export const PAGE_BITS = 12;
export const PAGE_SLOTS = 1 << PAGE_BITS;
const PAGE_MASK = PAGE_SLOTS - 1;

/** Who may write a page in place: the version that made it. A token, compared by identity. */
export type Owner = { readonly owner: true };
export const newOwner = (): Owner => ({ owner: true });

type SlotPage = {
  owner: Owner;
  kind: Uint8Array;
  num: Float64Array;
  // An interned row and column (CellAxes), and a style (0 for none).
  row: Int32Array;
  col: Int32Array;
  style: Int32Array;
  // A text cell's string, a held formula, an Other cell whole, by slot; made on the page's
  // first one, so a page of numbers holds none.
  boxed: unknown[] | null;
  // Packed formulas, each its length then its integers; those written over are dead until the pool is compacted.
  pool: Int32Array | null;
  poolUsed: number;
  poolDead: number;
};

function newPage(owner: Owner): SlotPage {
  return {
    owner,
    kind: new Uint8Array(PAGE_SLOTS),
    num: new Float64Array(PAGE_SLOTS),
    row: new Int32Array(PAGE_SLOTS),
    col: new Int32Array(PAGE_SLOTS),
    style: new Int32Array(PAGE_SLOTS),
    boxed: null,
    pool: null,
    poolUsed: 0,
    poolDead: 0,
  };
}

function copyPage(page: SlotPage, owner: Owner): SlotPage {
  return {
    owner,
    kind: page.kind.slice(),
    num: page.num.slice(),
    row: page.row.slice(),
    col: page.col.slice(),
    style: page.style.slice(),
    boxed: page.boxed ? page.boxed.slice() : null,
    pool: page.pool ? page.pool.slice() : null,
    poolUsed: page.poolUsed,
    poolDead: page.poolDead,
  };
}

/** The slot's whole content, as written. */
export type SlotValue = {
  kind: SlotKind;
  num: number;
  row: number;
  col: number;
  style: number;
  boxed: unknown;
  // A packed formula's integers (SlotKind.Formula).
  packed: ArrayLike<number> | null;
};

export class CellSlots {
  private pages: SlotPage[] = [];
  private owner: Owner = newOwner();
  // Slots handed out, the dead ones included.
  length = 0;

  /** A version sharing every page; neither this nor the copy writes a shared page in place again. */
  copy(): CellSlots {
    const out = new CellSlots();
    out.pages = this.pages.slice();
    out.length = this.length;
    this.owner = newOwner();
    return out;
  }

  kind(slot: number): SlotKind {
    return this.pages[slot >>> PAGE_BITS]!.kind[slot & PAGE_MASK] as SlotKind;
  }

  num(slot: number): number {
    return this.pages[slot >>> PAGE_BITS]!.num[slot & PAGE_MASK]!;
  }

  row(slot: number): number {
    return this.pages[slot >>> PAGE_BITS]!.row[slot & PAGE_MASK]!;
  }

  col(slot: number): number {
    return this.pages[slot >>> PAGE_BITS]!.col[slot & PAGE_MASK]!;
  }

  style(slot: number): number {
    return this.pages[slot >>> PAGE_BITS]!.style[slot & PAGE_MASK]!;
  }

  boxed(slot: number): unknown {
    return this.pages[slot >>> PAGE_BITS]!.boxed?.[slot & PAGE_MASK];
  }

  /** A packed formula's integers, as a view into its page's pool. */
  packed(slot: number): Int32Array {
    const page = this.pages[slot >>> PAGE_BITS]!;
    const start = page.num[slot & PAGE_MASK]!;
    return page.pool!.subarray(start + 1, start + 1 + page.pool![start]!);
  }

  /** A new slot at the end, holding `value`. */
  append(value: SlotValue): number {
    const slot = this.length++;
    if ((slot & PAGE_MASK) === 0) this.pages.push(newPage(this.owner));
    this.write(slot, value);
    return slot;
  }

  write(slot: number, value: SlotValue): void {
    const page = this.writable(slot >>> PAGE_BITS);
    const at = slot & PAGE_MASK;
    release(page, at);
    page.num[at] = value.kind === SlotKind.Formula ? pack(page, value.packed!) : value.num;
    page.kind[at] = value.kind;
    page.row[at] = value.row;
    page.col[at] = value.col;
    page.style[at] = value.style;
    if (value.boxed !== undefined)
      (page.boxed ??= new Array<unknown>(PAGE_SLOTS))[at] = value.boxed;
    else if (page.boxed) page.boxed[at] = undefined;
  }

  kill(slot: number): void {
    const page = this.writable(slot >>> PAGE_BITS);
    const at = slot & PAGE_MASK;
    release(page, at);
    if (page.boxed) page.boxed[at] = undefined;
  }

  private writable(index: number): SlotPage {
    const page = this.pages[index]!;
    if (page.owner === this.owner) return page;
    const own = copyPage(page, this.owner);
    this.pages[index] = own;
    return own;
  }
}

// The pool's first size, in integers: a page's first formulas.
const POOL_MIN = 256;

// A slot's packed formula, if it holds one, left dead in the pool; the slot is Dead until written again.
function release(page: SlotPage, at: number): void {
  if (page.kind[at] === SlotKind.Formula) page.poolDead += page.pool![page.num[at]!]! + 1;
  page.kind[at] = SlotKind.Dead;
}

// Where `packed` now starts in the page's pool: compacted first when half of it is dead, grown when still short.
function pack(page: SlotPage, packed: ArrayLike<number>): number {
  const need = packed.length + 1;
  if (page.pool && page.poolUsed + need > page.pool.length && page.poolDead * 2 > page.poolUsed) {
    compact(page);
  }
  if (!page.pool || page.poolUsed + need > page.pool.length) {
    let size = page.pool ? page.pool.length * 2 : POOL_MIN;
    while (size < page.poolUsed + need) size *= 2;
    const grown = new Int32Array(size);
    if (page.pool) grown.set(page.pool.subarray(0, page.poolUsed));
    page.pool = grown;
  }
  const start = page.poolUsed;
  page.pool[start] = packed.length;
  page.pool.set(packed, start + 1);
  page.poolUsed += need;
  return start;
}

// The pool holding only the live formulas, in slot order.
function compact(page: SlotPage): void {
  const pool = page.pool!;
  const kept = new Int32Array(pool.length);
  let used = 0;
  for (let at = 0; at < PAGE_SLOTS; at++) {
    if (page.kind[at] !== SlotKind.Formula) continue;
    const start = page.num[at]!;
    const length = pool[start]! + 1;
    kept.set(pool.subarray(start, start + length), used);
    page.num[at] = used;
    used += length;
  }
  page.pool = kept;
  page.poolUsed = used;
  page.poolDead = 0;
}

// Where each filled cell's slot is (docs/specs/029-sheets/performance.md "Held in memory"): an open-addressing hash
// of (row, col) to slot, linear probing, its buckets in pages copied on write as CellSlots' are.
import { newOwner, type CellSlots, type Owner } from './cell-slots';

const EMPTY = -1;
// A deleted cell's bucket: probing walks past it, an insert may reuse it.
const GONE = -2;
const PAGE_BITS = 12;
const PAGE_BUCKETS = 1 << PAGE_BITS;
const PAGE_MASK = PAGE_BUCKETS - 1;

type BucketPage = { owner: Owner; buckets: Int32Array };

function hash(row: number, col: number): number {
  let h = Math.imul(row, 0x9e3779b1) ^ Math.imul(col + 0x7f4a7c15, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return h ^ (h >>> 12);
}

export class SlotIndex {
  readonly capacity: number;
  private readonly mask: number;
  private readonly pages: BucketPage[];
  // Buckets not empty: live and gone. The index is full at half its capacity.
  private used: number;
  // The version that may write its own pages in place.
  private owner: Owner;

  private constructor(capacity: number, pages: BucketPage[], used: number, owner: Owner) {
    this.capacity = capacity;
    this.mask = capacity - 1;
    this.pages = pages;
    this.used = used;
    this.owner = owner;
  }

  /** An empty index of `capacity` buckets, a power of two. */
  static sized(capacity: number): SlotIndex {
    const owner = newOwner();
    const size = Math.min(capacity, PAGE_BUCKETS);
    const pages = Array.from({ length: capacity / size }, () => ({
      owner,
      buckets: new Int32Array(size).fill(EMPTY),
    }));
    return new SlotIndex(capacity, pages, 0, owner);
  }

  /** Room for one more cell without passing half full. */
  get hasRoom(): boolean {
    return (this.used + 1) * 2 <= this.capacity;
  }

  /** A version sharing every page; neither this nor the copy writes a shared page in place again. */
  copy(): SlotIndex {
    this.owner = newOwner();
    return new SlotIndex(this.capacity, this.pages.slice(), this.used, newOwner());
  }

  /** The slot of (row, col), or -1. */
  find(row: number, col: number, slots: CellSlots): number {
    for (let b = hash(row, col) & this.mask; ; b = (b + 1) & this.mask) {
      const slot = this.bucket(b);
      if (slot === EMPTY) return -1;
      if (slot !== GONE && slots.row(slot) === row && slots.col(slot) === col) return slot;
    }
  }

  /** Files a slot for (row, col), which the index does not hold; the caller made sure of room. */
  insert(row: number, col: number, slot: number): void {
    for (let b = hash(row, col) & this.mask; ; b = (b + 1) & this.mask) {
      const held = this.bucket(b);
      if (held === EMPTY || held === GONE) {
        if (held === EMPTY) this.used++;
        this.setBucket(b, slot);
        return;
      }
    }
  }

  /** Forgets (row, col): the slot it was at, or -1 when it held none. */
  remove(row: number, col: number, slots: CellSlots): number {
    for (let b = hash(row, col) & this.mask; ; b = (b + 1) & this.mask) {
      const slot = this.bucket(b);
      if (slot === EMPTY) return -1;
      if (slot !== GONE && slots.row(slot) === row && slots.col(slot) === col) {
        this.setBucket(b, GONE);
        return slot;
      }
    }
  }

  private bucket(b: number): number {
    return this.pages[b >>> PAGE_BITS]!.buckets[b & PAGE_MASK]!;
  }

  private setBucket(b: number, value: number): void {
    const index = b >>> PAGE_BITS;
    let page = this.pages[index]!;
    if (page.owner !== this.owner) {
      page = { owner: this.owner, buckets: page.buckets.slice() };
      this.pages[index] = page;
    }
    page.buckets[b & PAGE_MASK] = value;
  }
}

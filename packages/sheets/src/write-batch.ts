// A sheet's writes queued together, sent as one (docs/specs/029-sheets/sheet-store.md "Changing a sheet", write
// batching): consecutive cell writes merge into one write that leaves every cell as the writes in turn would. A later
// change to a cell takes its input and lays its format keys over the earlier's, as `mergeFormat` lays a patch.
// Changes that cannot be said as one (format keys after a whole-format clear, or one key set to an object twice,
// which the room merges deep) start a new write, as do layout and title writes and the per-write caps.
import type { FormatPatch } from './format';
import { SHEET_WRITE_BYTES_MAX, SHEET_WRITE_CELLS_MAX } from './limits';
import type { CellChange, SheetWrite } from './store';

// The bytes a merged write keeps under its cap, as splitWrite does.
const BYTES_MAX = SHEET_WRITE_BYTES_MAX - 4096;

const isObject = (v: unknown): boolean => typeof v === 'object' && v !== null;

// One format patch over another, or null when the two cannot be one patch.
function composedFormat(
  a: FormatPatch | null | undefined,
  b: FormatPatch | null | undefined,
): { f: FormatPatch | null | undefined } | null {
  if (b === undefined) return { f: a };
  if (a === undefined || b === null) return { f: b };
  if (a === null) return null;
  for (const [k, v] of Object.entries(b))
    if (isObject(v) && isObject(a[k as keyof FormatPatch])) return null;
  return { f: { ...a, ...b } };
}

// A change to a cell after another, as one change; null when they cannot be one.
function composedChange(a: CellChange, b: CellChange): CellChange | null {
  const format = composedFormat(a.f, b.f);
  if (!format) return null;
  const i = b.i !== undefined ? b.i : a.i;
  return {
    r: a.r,
    c: a.c,
    ...(i !== undefined ? { i } : {}),
    ...(format.f !== undefined ? { f: format.f } : {}),
  };
}

const keyOf = (ch: CellChange): string => `${ch.r}:${ch.c}`;
const sizeOf = (ch: CellChange): number => JSON.stringify(ch).length + 1;

// A cell write being gathered: its changes by cell, in the order each cell was first changed.
class Gathered {
  readonly changes = new Map<string, CellChange>();
  bytes = 0;

  /** Takes `cells` in if every change composes and the caps hold; else takes nothing and answers false. */
  take(cells: readonly CellChange[]): boolean {
    const next = new Map<string, CellChange>();
    let bytes = this.bytes;
    for (const ch of cells) {
      const key = keyOf(ch);
      const before = next.get(key) ?? this.changes.get(key);
      const merged = before ? composedChange(before, ch) : ch;
      if (!merged) return false;
      next.set(key, merged);
      bytes += sizeOf(ch);
    }
    let count = this.changes.size;
    for (const key of next.keys()) if (!this.changes.has(key)) count++;
    if (this.changes.size > 0 && (count > SHEET_WRITE_CELLS_MAX || bytes > BYTES_MAX)) return false;
    for (const [key, ch] of next) this.changes.set(key, ch);
    this.bytes = bytes;
    return true;
  }

  write(): SheetWrite {
    return { kind: 'cells', cells: [...this.changes.values()] };
  }
}

/** The writes as fewer: each run of cell writes merged as far as the rules above allow, order kept. */
export function coalesceWrites(writes: readonly SheetWrite[]): SheetWrite[] {
  const out: SheetWrite[] = [];
  let gathered: Gathered | null = null;
  // A write that could not join is sent as it was.
  const close = () => {
    if (gathered) out.push(gathered.write());
    gathered = null;
  };
  for (const write of writes) {
    if (write.kind !== 'cells') {
      close();
      out.push(write);
      continue;
    }
    if (gathered?.take(write.cells)) continue;
    close();
    const fresh = new Gathered();
    if (fresh.take(write.cells)) gathered = fresh;
    else out.push(write);
  }
  close();
  return out;
}

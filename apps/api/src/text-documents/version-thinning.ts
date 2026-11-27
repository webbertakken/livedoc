// Thinning a text document tab's versions (docs/specs/034-text-documents/live-editing-and-storage.md "Taking a
// version"): automatic versions older than the days kept whole keep the newest of each UTC day; then, past the count or
// byte cap, the oldest automatic ones go. Named versions and the newest version never go. Each version that goes hands
// its deletions and editors to the next version that stays, so every kept version still reads whole.

/** A version as thinning reads it. `ownBytes`: what it frees by going (its deletions move to the next one). */
export type ThinnedRow = {
  readonly id: string;
  readonly seq: number;
  readonly kind: 'automatic' | 'named';
  readonly takenAt: number;
  readonly bytes: number;
  readonly ownBytes: number;
};

export type ThinningCaps = {
  readonly keepAllDays: number;
  readonly autoMax: number;
  readonly maxBytes: number;
};

/** One version that goes, and the kept version that takes its deletions and editors. */
export type Thinned = { readonly drop: string; readonly into: string };

const DAY_MS = 86_400_000;

/** The versions that go, oldest first, each with the version that stays after it. */
export function planThinning(
  rows: readonly ThinnedRow[],
  now: number,
  caps: ThinningCaps,
): Thinned[] {
  const ordered = [...rows].sort((a, b) => a.seq - b.seq);
  const newest = ordered.at(-1);
  const goes = new Set<string>();
  const thinnable = (row: ThinnedRow) => row.kind === 'automatic' && row !== newest;

  // Older than the days kept whole: the newest automatic version of each UTC day stays.
  const cutoff = now - caps.keepAllDays * DAY_MS;
  const newestOfDay = new Map<number, ThinnedRow>();
  for (const row of ordered)
    if (row.kind === 'automatic' && row.takenAt < cutoff)
      newestOfDay.set(Math.floor(row.takenAt / DAY_MS), row);
  for (const row of ordered)
    if (thinnable(row) && row.takenAt < cutoff && newestOfDay.get(Math.floor(row.takenAt / DAY_MS)) !== row)
      goes.add(row.id);

  // Past either cap, the oldest automatic versions go.
  let autos = ordered.filter((row) => row.kind === 'automatic' && !goes.has(row.id)).length;
  let bytes = ordered.reduce((n, row) => n + row.bytes - (goes.has(row.id) ? row.ownBytes : 0), 0);
    if (!thinnable(row) || goes.has(row.id)) continue;
    goes.add(row.id);
    autos -= 1;
    bytes -= row.ownBytes;
  }

  return ordered
    .filter((row) => goes.has(row.id))
    .map((row) => ({
      drop: row.id,
      into: ordered.find((later) => later.seq > row.seq && !goes.has(later.id))!.id,
    }));
}

// A sheet's row or column order in chunks (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Layout): a row
// may hold at most 8 MB, and a sheet's ids run to millions. Chunks are keyed apart (AXIS_CHUNK_GAP), so a chunk can
// grow, empty or split without renumbering the ones after it, and a write stores only the chunks it changed.

// A fresh chunk's ids: about 450 KB of JSON at six-character ids. 10,000 to 200,000.
export const AXIS_CHUNK_IDS = 50_000;
// Past this a chunk splits: about 900 KB, far under the 8 MB row cap. Twice AXIS_CHUNK_IDS or more.
export const AXIS_CHUNK_IDS_MAX = 100_000;
// Keys of fresh chunks lie this far apart, so a chunk splits into new keys between its own and the next.
export const AXIS_CHUNK_GAP = 1 << 16;

export type AxisChunk = { readonly key: number; readonly ids: readonly string[] };

/** What a write stores: the chunks to put (insert or replace by key) and the keys to delete. */
export type AxisChunkPlan = {
  readonly put: readonly AxisChunk[];
  readonly drop: readonly number[];
};

function fresh(ids: readonly string[]): AxisChunk[] {
  const out: AxisChunk[] = [];
  for (let at = 0; at < ids.length; at += AXIS_CHUNK_IDS)
    out.push({ key: out.length * AXIS_CHUNK_GAP, ids: ids.slice(at, at + AXIS_CHUNK_IDS) });
  return out;
}

// The order after a write, in the chunks it had where they still hold: each id stays in its chunk, a new id joins
// the chunk of the id before it. Null when the chunks no longer run in key order (a sort, a move across chunks).
// `before` is in key order and not empty.
function kept(
  before: readonly AxisChunk[],
  after: readonly string[],
): { key: number; ids: string[] }[] | null {
  const chunkOf = new Map<string, number>();
  for (const chunk of before) for (const id of chunk.ids) chunkOf.set(id, chunk.key);
  const out: { key: number; ids: string[] }[] = [];
  let key = before[0]!.key;
  for (const id of after) {
    const own = chunkOf.get(id);
    if (own !== undefined) {
      if (own < key) return null;
      key = own;
    }
    const last = out[out.length - 1];
    if (last?.key === key) last.ids.push(id);
    else out.push({ key, ids: [id] });
  }
  return out;
}

// Chunks past AXIS_CHUNK_IDS_MAX split into fresh-sized ones keyed between their own key and the next chunk's; null
// when the keys between have run out.
function split(
  chunks: { key: number; ids: string[] }[],
  before: readonly AxisChunk[],
): AxisChunk[] | null {
  const keys = [...new Set([...before.map((c) => c.key), ...chunks.map((c) => c.key)])].sort(
    (a, b) => a - b,
  );
  const out: AxisChunk[] = [];
  for (const chunk of chunks) {
    if (chunk.ids.length <= AXIS_CHUNK_IDS_MAX) {
      out.push(chunk);
      continue;
    }
    const parts = Math.ceil(chunk.ids.length / AXIS_CHUNK_IDS);
    const next = keys.find((k) => k > chunk.key) ?? chunk.key + AXIS_CHUNK_GAP;
    const step = Math.floor((next - chunk.key) / parts);
    if (step < 1) return null;
    for (let part = 0; part < parts; part++) {
      const ids = chunk.ids.slice(part * AXIS_CHUNK_IDS, (part + 1) * AXIS_CHUNK_IDS);
      out.push({ key: chunk.key + part * step, ids });
    }
  }
  return out;
}

function same(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const AxisChunks = {
  /** An order in fresh chunks. */
  of: fresh,

  /** The order the chunks hold, in key order. */
  join: (chunks: readonly AxisChunk[]): string[] =>
    [...chunks].sort((a, b) => a.key - b.key).flatMap((c) => c.ids),

  /** What to store so `before` holds `after`: only the chunks that changed, or the order afresh when it must be. */
  plan(before: readonly AxisChunk[], after: readonly string[]): AxisChunkPlan {
    const ordered = [...before].sort((a, b) => a.key - b.key);
    const chunks = ordered.length > 0 ? kept(ordered, after) : null;
    const next = (chunks && split(chunks, before)) ?? fresh(after);
    const old = new Map(before.map((c) => [c.key, c.ids]));
    const put = next.filter((c) => {
      const was = old.get(c.key);
      return !was || !same(was, c.ids);
    });
    const live = new Set(next.map((c) => c.key));
    return { put, drop: before.map((c) => c.key).filter((k) => !live.has(k)) };
  },
} as const;

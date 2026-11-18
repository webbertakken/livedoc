// docs/specs/029-sheets/sheet-store.md "In a spreadsheet" (Layout): an order in chunks, a write storing what it changed.
import { describe, expect, it } from 'vitest';
import {
  AXIS_CHUNK_GAP,
  AXIS_CHUNK_IDS,
  AXIS_CHUNK_IDS_MAX,
  AxisChunks,
  type AxisChunk,
} from './axis-chunks';

const ids = (from: number, n: number, tag = 'r') =>
  Array.from({ length: n }, (_, i) => `${tag}${from + i}`);

// The chunks a plan leaves, as the room would hold them.
function apply(before: readonly AxisChunk[], after: readonly string[]): AxisChunk[] {
  const plan = AxisChunks.plan(before, after);
  const held = new Map(before.map((c) => [c.key, c]));
  for (const key of plan.drop) held.delete(key);
  for (const chunk of plan.put) held.set(chunk.key, chunk);
  return [...held.values()].sort((a, b) => a.key - b.key);
}

describe('AxisChunks', () => {
  it('stores an order in chunks of AXIS_CHUNK_IDS, keyed apart, and joins them back', () => {
    const order = ids(0, AXIS_CHUNK_IDS * 2 + 7);
    const chunks = AxisChunks.of(order);
    expect(chunks.map((c) => [c.key, c.ids.length])).toEqual([
      [0, AXIS_CHUNK_IDS],
      [AXIS_CHUNK_GAP, AXIS_CHUNK_IDS],
      [2 * AXIS_CHUNK_GAP, 7],
    ]);
    expect(AxisChunks.join([...chunks].reverse())).toEqual(order);
    expect(AxisChunks.of([])).toEqual([]);
  });

  it('rewrites only the chunk an insert or a delete falls in', () => {
    const before = AxisChunks.of(ids(0, AXIS_CHUNK_IDS * 3));
    const order = AxisChunks.join(before);
    const after = [...order.slice(0, 70_000), 'new1', 'new2', ...order.slice(70_000)];
    after.splice(120_000, 5);
    const plan = AxisChunks.plan(before, after);
    expect(plan.put.map((c) => c.key)).toEqual([AXIS_CHUNK_GAP, 2 * AXIS_CHUNK_GAP]);
    expect(plan.drop).toEqual([]);
    expect(AxisChunks.join(apply(before, after))).toEqual(after);
  });

  it('puts new ids at the very start into the first chunk', () => {
    const before = AxisChunks.of(ids(0, 10));
    const after = ['first', ...AxisChunks.join(before)];
    expect(AxisChunks.plan(before, after).put).toEqual([{ key: 0, ids: after }]);
  });

  it('stores nothing when the order is the same, and drops a chunk left empty', () => {
    const before = AxisChunks.of(ids(0, AXIS_CHUNK_IDS + 3));
    expect(AxisChunks.plan(before, AxisChunks.join(before))).toEqual({ put: [], drop: [] });
    const after = AxisChunks.join(before).slice(0, AXIS_CHUNK_IDS);
    expect(AxisChunks.plan(before, after)).toEqual({ put: [], drop: [AXIS_CHUNK_GAP] });
    expect(AxisChunks.plan(before, [])).toEqual({ put: [], drop: [0, AXIS_CHUNK_GAP] });
  });

  it('splits a chunk grown past AXIS_CHUNK_IDS_MAX between its key and the next', () => {
    const before = AxisChunks.of(ids(0, AXIS_CHUNK_IDS * 2));
    const order = AxisChunks.join(before);
    const grown = [...order.slice(0, 10), ...ids(0, AXIS_CHUNK_IDS_MAX, 'n'), ...order.slice(10)];
    const plan = AxisChunks.plan(before, grown);
    expect(plan.put.map((c) => c.key)).toEqual([0, 21_845, 43_690]);
    expect(plan.put.every((c) => c.ids.length <= AXIS_CHUNK_IDS)).toBe(true);
    expect(AxisChunks.join(apply(before, grown))).toEqual(grown);
    // The last chunk splits into the gap after it; its first part holds what it held, so only the rest are written.
    const tail = [...order, ...ids(0, AXIS_CHUNK_IDS_MAX, 't')];
    expect(AxisChunks.plan(before, tail).put.map((c) => c.key)).toEqual([
      AXIS_CHUNK_GAP + 21_845,
      AXIS_CHUNK_GAP + 43_690,
    ]);
  });

  it('writes the order afresh after a sort, a move across chunks, or keys run out', () => {
    const before = AxisChunks.of(ids(0, AXIS_CHUNK_IDS + 2));
    const order = AxisChunks.join(before);
    const moved = [order[AXIS_CHUNK_IDS]!, ...order.filter((_, i) => i !== AXIS_CHUNK_IDS)];
    expect(AxisChunks.plan(before, moved)).toEqual({ put: AxisChunks.of(moved), drop: [] });
    const reversed = [...order].reverse();
    expect(AxisChunks.join(apply(before, reversed))).toEqual(reversed);
    const tight: AxisChunk[] = [
      { key: 0, ids: ids(0, 3) },
      { key: 1, ids: ids(3, 3) },
    ];
    const grown = [...ids(0, 3), ...ids(0, AXIS_CHUNK_IDS_MAX, 'n'), ...ids(3, 3)];
    expect(AxisChunks.plan(tight, grown).put).toEqual(AxisChunks.of(grown));
  });

  it('makes an order with no chunks before it afresh', () => {
    const order = ids(0, 5);
    expect(AxisChunks.plan([], order)).toEqual({ put: AxisChunks.of(order), drop: [] });
  });
});

// docs/specs/029-sheets/performance.md "Held in memory": the store's budgets at 1 million cells, 100,000 rows of 10
// columns. Held bytes are measured after a full collection. Time is CPU time: a write against a ceiling with room
// for CI; a load as growth, not as a ceiling, since coverage on a CI runner makes an absolute budget for a second's
// work flake (it read 7.3 s there for 1.1 s here), and a ratio does not. The spec's load budget is measured here.
import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { cpuMsOf } from '@livedoc/vitest-config/cpu-time';
import { CellMap } from './cell-map';
import { cellsFromJson, type SheetCellJson } from '../sheet-json';
import { storedAst } from '../formula/stored';

const CI_FACTOR = 4;
const ROWS = 100_000;
const COLS = 10;
const CELLS = ROWS * COLS;

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;
function heldBytes(): number {
  gc();
  gc();
  // Typed arrays hold their bytes outside the heap.
  const { heapUsed, arrayBuffers } = process.memoryUsage();
  return heapUsed + arrayBuffers;
}

const rowIds = Array.from({ length: ROWS }, (_, r) => `row${r.toString(36).padStart(6, '0')}`);
const colIds = Array.from({ length: COLS }, (_, c) => `col${c}`);

// Ten times the cells loaded may cost at most this many times as much. Linear is 10; the larger index missing the
// CPU cache and collecting a larger heap read 10 to 16 here; a quadratic load would read 100.
const LOAD_GROWTH_MAX = 30;

// Filled-down formulas as loaded from the wire: each formula its own objects, its ids fresh strings.
function wire(rows: readonly string[]): SheetCellJson[] {
  const out: SheetCellJson[] = [];
  for (const row of rows) {
    for (const col of colIds) {
      const r = [
        { r1: `${row}`, c1: 'col0' },
        { r1: `${row}`, c1: 'col1' },
      ];
      out.push({ r: row, c: col, i: { f: { t: '@0*2+@1', r } } });
    }
  }
  return out;
}

describe('CellMap at 1 million cells', () => {
  it('holds a number cell in 60 bytes', () => {
    const before = heldBytes();
    const map = new CellMap();
    for (const row of rowIds)
      for (const col of colIds) map.set(`${row}:${col}`, { input: { n: 1.5 } });
    const perCell = (heldBytes() - before) / CELLS;
    console.info(`[sheets perf] number cell ${perCell.toFixed(1)} bytes held`);
    expect(map.size).toBe(CELLS);
    expect(perCell).toBeLessThan(60);
  }, 60_000);

  it('holds a filled-down formula cell of two references in 120 bytes, one tree for the column', () => {
    // As loaded from the wire: each formula its own objects, its ids fresh strings. The wire is let go before the
    // store is measured.
    const before = heldBytes();
    const loaded = wire(rowIds);
    let map!: CellMap;
    const load = cpuMsOf(() => {
      map = cellsFromJson(loaded);
    });
    loaded.length = 0;
    const tree = storedAst((map.get(`${rowIds[0]}:col3`)!.input as { f: never }).f);
    const perCell = (heldBytes() - before) / CELLS;
    console.info(
      `[sheets perf] formula cell ${perCell.toFixed(1)} bytes held, load ${load.toFixed(0)} ms`,
    );
    expect(storedAst((map.get(`${rowIds[ROWS - 1]}:col9`)!.input as { f: never }).f)).toBe(tree);
    expect(perCell).toBeLessThan(120);
    // Ten times the cells, under thirty times the time: a tenth loaded at its fastest of three.
    const tenth = wire(rowIds.slice(0, ROWS / 10));
    const small = Math.min(...[0, 1, 2].map(() => cpuMsOf(() => cellsFromJson(tenth))));
    console.info(`[sheets perf] a tenth loads in ${small.toFixed(0)} ms`);
    expect(load).toBeLessThan(small * LOAD_GROWTH_MAX);
  }, 60_000);

  it('writes one cell into the next version within a millisecond', () => {
    let map = new CellMap();
    for (const row of rowIds)
      for (const col of colIds) map.set(`${row}:${col}`, { input: { n: 1 } });
    const versions = 200;
    const spent = cpuMsOf(() => {
      for (let v = 0; v < versions; v++) {
        const next = map.copy();
        next.set(`${rowIds[(v * 7919) % ROWS]}:col3`, { input: { n: v } });
        map = next;
      }
    });
    const perWrite = spent / versions;
    console.info(`[sheets perf] one cell into the next version ${(perWrite * 1000).toFixed(0)} µs`);
    expect(map.get(`${rowIds[(199 * 7919) % ROWS]}:col3`)).toEqual({ input: { n: 199 } });
    expect(perWrite).toBeLessThan(1 * CI_FACTOR);
  }, 60_000);
});

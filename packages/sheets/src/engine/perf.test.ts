// Performance (docs/specs/029-sheets/performance.md), measured on the worst case a Plan Sheet's limits allow: 50,000
// filled cells, 20,000 of them formulas. What is held everywhere is the WORK: each formula worked out once, and a change
// working out again only what reads it; and the change's cost against the full workout measured in the same run, which
// v8 coverage slows alike. The laptop's absolute CPU budgets are held only where the code runs uninstrumented: under
// coverage the same work measured eight times slower (1,639 ms against 205, main 2026-11-20).
import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { cpuMsOf, UNDER_COVERAGE_ENV } from '@livedoc/vitest-config/cpu-time';
import { Workbook } from './workbook';
import { cellKey, type Sheet } from '../sheet';
import { CellMap } from '../cells/cell-map';
import { layoutIndex } from '../layout';
import { compileFormula } from '../formula/stored';

const CI_FACTOR = 4;

// What the engine may hold for each formula it has worked out: its value and what it reads (performance.md).
const HELD_BYTES_PER_FORMULA_MAX = 160;

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;
function heldBytes(): number {
  gc();
  gc();
  // Typed arrays hold their bytes outside the heap.
  const { heapUsed, arrayBuffers } = process.memoryUsage();
  return heapUsed + arrayBuffers;
}

// Every formula the engine works out, counted.
const evaluated = vi.hoisted(() => ({ n: 0 }));
vi.mock('./evaluate', async (load) => {
  const real = await load<typeof import('./evaluate')>();
  return {
    ...real,
    evaluate: (...args: Parameters<typeof real.evaluate>) => {
      evaluated.n++;
      return real.evaluate(...args);
    },
  };
});

const counted = (fn: () => void): number => {
  evaluated.n = 0;
  fn();
  return evaluated.n;
};

function bigSheet(): Sheet {
  const rows = 10_000;
  const cols = 5;
  const layout = {
    rows: Array.from({ length: rows }, (_, i) => `r${i}`),
    cols: Array.from({ length: cols }, (_, i) => `c${i}`),
  };
  const sheet: Sheet = {
    id: 'bigsheet',
    tabId: 't',
    title: 'Big',
    layout,
    cells: new CellMap(),
    rev: 0,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: { id: '', name: '', color: '#000000' },
  };
  const ctx = {
    own: { id: sheet.id, title: sheet.title, layout },
    byTitle: () => undefined,
    byId: () => undefined,
  };
  const f = (text: string) => {
    const r = compileFormula(text, ctx);
    if (!r.ok) throw new Error(text);
    return r.formula;
  };
  for (let r = 0; r < rows; r++) {
    // A, B, C: numbers (30,000 cells). D: a running SUM of a 10-cell window. E: a reference chain.
    sheet.cells.set(cellKey(layout.rows[r]!, 'c0'), { input: { n: r } });
    sheet.cells.set(cellKey(layout.rows[r]!, 'c1'), { input: { n: r * 2 } });
    sheet.cells.set(cellKey(layout.rows[r]!, 'c2'), { input: { n: 1 } });
    const lo = Math.max(1, r - 8);
    sheet.cells.set(cellKey(layout.rows[r]!, 'c3'), { input: { f: f(`=SUM(A${lo}:B${r + 1})`) } });
    sheet.cells.set(cellKey(layout.rows[r]!, 'c4'), {
      input: { f: f(r === 0 ? '=C1' : `=E${r}+C${r + 1}`) },
    });
  }
  return sheet;
}

describe('performance', () => {
  it('holds under 160 bytes for each formula it has worked out', () => {
    const sheet = bigSheet();
    const wb = new Workbook({ sheets: [sheet], locale: 'en' });
    // The layout's index is the sheet's, built for the grid too: not the engine's to count.
    layoutIndex(sheet.layout);
    const before = heldBytes();
    for (let r = 0; r < 10_000; r++) for (let c = 0; c < 5; c++) wb.value(sheet.id, r, c);
    const perFormula = (heldBytes() - before) / 20_000;
    console.info(`[sheets perf] engine ${perFormula.toFixed(0)} bytes held a formula`);
    expect(wb.value(sheet.id, 9_999, 4)).toBe(10_000);
    expect(perFormula).toBeLessThan(HELD_BYTES_PER_FORMULA_MAX);
  }, 30_000);

  it('works out every cell of a 50,000-cell sheet, then a one-cell change, within budget', () => {
    const sheet = bigSheet();
    expect(sheet.cells.size).toBe(50_000);
    // CPU time (cpuMsOf), not wall-clock: under turbo's parallel suites a wall-clock budget also
    // counted the time spent waiting for a core.
    let wb!: Workbook;
    let full = 0;
    const fullWork = counted(() => {
      full = cpuMsOf(() => {
        wb = new Workbook({ sheets: [sheet], locale: 'en' });
        for (let r = 0; r < 10_000; r++) for (let c = 0; c < 5; c++) wb.value(sheet.id, r, c);
      });
    });
    expect(wb.value(sheet.id, 9_999, 4)).toBe(10_000);
    // Each of the 20,000 formulas worked out once, and read again from what was kept.
    expect(fullWork).toBe(20_000);

    // Change C5000: half the chain (5,000 cells) depends on it.
    const key = cellKey('r4999', 'c2');
    const cells = sheet.cells.copy();
    cells.set(key, { input: { n: 2 } });
    const next = { ...sheet, cells };
    let after: unknown;
    let change = 0;
    const changeWork = counted(() => {
      change = cpuMsOf(() => {
        wb.updateSheet(next, [key]);
        after = wb.value(sheet.id, 9_999, 4);
      });
    });
    expect(after).toBe(10_001);
    // E5000 to E10000 read C5000 down the chain, and nothing else is worked out again: the read settles the chain
    // deepest first, so each link is worked out once (formulas.md "Recalculation").
    expect(changeWork).toBe(5_001);

    // A change nothing reads.
    const lone = cellKey('r100', 'c1');
    const cells2 = next.cells.copy();
    cells2.set(lone, { input: { n: 7 } });
    let small = 0;
    const smallWork = counted(() => {
      small = cpuMsOf(() => {
        wb.updateSheet({ ...next, cells: cells2 }, [lone]);
        wb.value(sheet.id, 100, 3);
      });
    });
    // Only the window sum read: one formula.
    expect(smallWork).toBe(1);

    console.info(
      `[sheets perf] full ${full.toFixed(0)} ms, chain change ${change.toFixed(1)} ms, local change ${small.toFixed(2)} ms`,
    );
    // Against the full workout in the same run: a quarter of the formulas costs well under half its time.
    expect(change).toBeLessThan(full / 2);
    expect(small).toBeLessThan(full / 20);
    if (!process.env[UNDER_COVERAGE_ENV]) {
      expect(full).toBeLessThan(400 * CI_FACTOR);
      expect(change).toBeLessThan(100 * CI_FACTOR);
      expect(small).toBeLessThan(5 * CI_FACTOR);
    }
    // The budgets above are CPU time; the wall clock only bounds a hung run. On a loaded CI runner
    // building the 50,000-cell sheet outran vitest's default 5 s while its CPU budget still held.
  }, 30_000);
});

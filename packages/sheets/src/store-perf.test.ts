// Row operations stay linear in the sheet: a sort, a delete
// and its undo over 10,000 rows once each scanned the layout per id. Timed as growth in CPU time (cpuMsOf), not as a
// ceiling: four times the rows should cost about four times as much; a scan per id would cost sixteen. The fastest of
// seven runs each, the two sizes taken in turn, so a busy stretch of the machine (another suite's cache and memory
// traffic) bends both alike rather than one of them; the small sheet's few milliseconds bend with any noise.
import { describe, expect, it } from 'vitest';
import { cpuMsOf } from '@livedoc/vitest-config/cpu-time';
import { makeSheets } from './testing/book';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from './store';

const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };
const RATIO_CEILING = 8;

const RUNS = 7;

function runOf(rows: number): () => number {
  const sheet = makeSheets({ S: { A1: '1' } }, { rows, cols: 3 })[0]!;
  const ids = sheet.layout.rows;
  const writes: SheetWrite[] = [
    { kind: 'layout', changes: [{ k: 'orderRows', ids: [...ids].reverse() }] },
    { kind: 'layout', changes: [{ k: 'deleteRows', ids: ids.slice(1) }] },
  ];
  return () =>
    cpuMsOf(() => {
      for (const w of writes) inverseSheetWrite(sheet, applySheetWrite(sheet, w, ctx));
    });
}

describe('row operations as a sheet grows', () => {
  it('cost about linearly more, never quadratically', { timeout: 30_000 }, () => {
    const small = runOf(2_500);
    const large = runOf(10_000);
    small();
    let [fastestSmall, fastestLarge] = [Infinity, Infinity];
    for (let run = 0; run < RUNS; run++) {
      fastestSmall = Math.min(fastestSmall, small());
      fastestLarge = Math.min(fastestLarge, large());
    }
    expect(fastestLarge / fastestSmall).toBeLessThan(RATIO_CEILING);
  });
});

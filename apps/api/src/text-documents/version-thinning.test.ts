import { describe, expect, it } from 'vitest';
import { planThinning, type ThinnedRow } from './version-thinning';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 27, 12);
const caps = { keepAllDays: 30, autoMax: 1000, maxBytes: 8_000_000 };

let seq = 0;
const row = (takenAt: number, over: Partial<ThinnedRow> = {}): ThinnedRow => {
  seq += 1;
  return { id: `v${seq}`, seq, kind: 'automatic', takenAt, bytes: 100, ownBytes: 40, ...over };
};

describe('planThinning', () => {
  it('keeps every version of the last 30 days', () => {
    const rows = [row(NOW - 2 * DAY), row(NOW - 2 * DAY + 1), row(NOW - DAY)];
    expect(planThinning(rows, NOW, caps)).toEqual([]);
  });

  it('keeps the newest automatic version of each older UTC day, handing the others to the next kept one', () => {
    const day = Date.UTC(2026, 9, 1);
    const rows = [row(day + 1000), row(day + 2000), row(day + 3000), row(day + DAY + 5), row(NOW)];
    const [a, b, c, d] = rows;
    expect(planThinning(rows, NOW, caps)).toEqual([
      { drop: a!.id, into: c!.id },
      { drop: b!.id, into: c!.id },
    ]);
    expect(d).toBeDefined();
  });

  it('never thins a named version', () => {
    const day = Date.UTC(2026, 9, 1);
    const rows = [row(day + 1, { kind: 'named' }), row(day + 2), row(NOW)];
    expect(planThinning(rows, NOW, caps)).toEqual([]);
  });

  it('hands a thinned version to the next kept one even when it is named', () => {
    const day = Date.UTC(2026, 9, 1);
    const rows = [row(day + 1), row(day + 2, { kind: 'named' }), row(day + 3), row(NOW)];
    expect(planThinning(rows, NOW, caps)).toEqual([{ drop: rows[0]!.id, into: rows[1]!.id }]);
  });

  it('lets the oldest automatic versions go past the count cap', () => {
    const rows = [row(NOW - 3), row(NOW - 2, { kind: 'named' }), row(NOW - 1), row(NOW)];
    expect(planThinning(rows, NOW, { ...caps, autoMax: 2 })).toEqual([
      { drop: rows[0]!.id, into: rows[1]!.id },
    ]);
  });

  it('lets the oldest automatic versions go past the byte cap, counting what each frees', () => {
    const rows = [row(NOW - 3), row(NOW - 2), row(NOW - 1), row(NOW)];
    // 400 bytes; each that goes frees its own 40: two must go to reach 330. Each goes into a version that stays.
    expect(planThinning(rows, NOW, { ...caps, maxBytes: 330 })).toEqual([
      { drop: rows[0]!.id, into: rows[2]!.id },
      { drop: rows[1]!.id, into: rows[2]!.id },
    ]);
  });

  it('never lets the newest version go', () => {
    const rows = [row(NOW - 1), row(NOW)];
    expect(planThinning(rows, NOW, { ...caps, autoMax: 0, maxBytes: 0 })).toEqual([
      { drop: rows[0]!.id, into: rows[1]!.id },
    ]);
  });
});

// docs/specs/029-sheets/performance.md "Held in memory": the compact store reads back as a Map would.
import { describe, expect, it } from 'vitest';
import { CellMap } from './cell-map';
import type { Cell, StoredFormula } from '../sheet';

const formula = (t: string, r1: string, c1: string): StoredFormula => ({ t, r: [{ r1, c1 }] });

// A seeded generator, so the random walk below is the same on every run.
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomCell(rand: () => number): Cell {
  const pick = Math.floor(rand() * 7);
  const format =
    rand() < 0.3 ? { b: true as const, fc: rand() < 0.5 ? '#ff0000' : '#00ff00' } : undefined;
  const input =
    pick === 0
      ? { n: rand() * 1000 }
      : pick === 1
        ? { s: `t${Math.floor(rand() * 50)}` }
        : pick === 2
          ? { b: rand() < 0.5 }
          : pick === 3
            ? { f: formula('@0*2', `r${Math.floor(rand() * 9)}`, 'c1') }
            : pick === 4
              ? undefined
              : { n: -0 };
  if (!input) return format ? { format } : {};
  return format ? { input, format } : { input };
}

describe('CellMap', () => {
  it('holds each kind of input and format as given', () => {
    const cells: [string, Cell][] = [
      ['r1:c1', { input: { n: 4.5 } }],
      ['r1:c2', { input: { s: 'hello' } }],
      ['r1:c3', { input: { b: true } }],
      ['r1:c4', { input: { b: false } }],
      ['r1:c5', { input: { f: formula('@0+1', 'r1', 'c1') } }],
      ['r2:c1', { format: { b: true } }],
      ['r2:c2', {}],
      ['r2:c3', { input: { n: Number.NaN }, format: { nf: 'percent', dp: 1 } }],
      ['r2:c4', { input: { img: { id: 'img-1', alt: 'A cow' } } }],
      ['r2:c5', { input: { img: { id: 'img-2' } }, format: { bg: '#ff0000' } }],
    ];
    const map = CellMap.from(cells);
    expect(map.size).toBe(cells.length);
    for (const [key, cell] of cells) expect(map.get(key)).toEqual(cell);
    expect([...map.keys()]).toEqual(cells.map(([k]) => k));
    expect(map.get('r9:c9')).toBeUndefined();
    expect(map.has('r1:c1')).toBe(true);
    expect(map.has('r1:c9')).toBe(false);
    expect(map.has('nokey')).toBe(false);
    expect(Object.prototype.toString.call(map)).toBe('[object CellMap]');
  });

  it("holds a cell not of a cell's shape as given, for validation to refuse", () => {
    const odd = [
      { input: { x: 1 } },
      { input: 5 },
      { format: 'bold' },
      { input: { n: 1, s: 'x' } },
      { input: { f: { t: '@0', r: [], extra: 1 } } },
      { input: { f: { t: 1, r: [] } } },
      { input: { f: { t: '@0', r: ['A1'] } } },
      { input: { img: 'img-1' } },
      { input: { img: null } },
      null,
    ];
    const map = new CellMap();
    odd.forEach((cell, i) => map.set(`r${i}:c`, cell as never));
    odd.forEach((cell, i) => expect(map.get(`r${i}:c`)).toBe(cell));
    map.set('r0:c', { input: { n: 1 } });
    expect(map.get('r0:c')).toEqual({ input: { n: 1 } });
  });

  // inserted-objects.md "Images in a cell" (D630): the grid asks whether any cell holds a picture on every paint.
  it('counts the cells holding a picture through writes, deletes, compaction and copies', () => {
    const map = new CellMap();
    expect(map.pictureCount).toBe(0);
    map.set('r1:c1', { input: { img: { id: 'a' } } });
    map.set('r1:c2', { input: { img: { id: 'b' } } });
    map.set('r1:c1', { input: { img: { id: 'c' } } });
    expect(map.pictureCount).toBe(2);
    const copy = map.copy();
    map.set('r1:c1', { input: { n: 1 } });
    expect(map.pictureCount).toBe(1);
    expect(copy.pictureCount).toBe(2);
    expect(copy.get('r1:c1')).toEqual({ input: { img: { id: 'c' } } });
    map.delete('r1:c2');
    map.delete('r1:c2');
    expect(map.pictureCount).toBe(0);
    for (let i = 0; i < 300; i++) map.setCell(`r${i}`, 'c9', { img: { id: `p${i}` } });
    for (let i = 0; i < 280; i++) map.delete(`r${i}:c9`);
    expect(map.pictureCount).toBe(20);
    expect(map.get('r299:c9')).toEqual({ input: { img: { id: 'p299' } } });
    map.clear();
    expect(map.pictureCount).toBe(0);
  });

  it("reads only an input's own keys", () => {
    const input = Object.assign(Object.create({ inherited: true }), { n: 3 });
    const map = new CellMap([['r1:c1', { input: input as { n: number } }]]);
    expect(map.get('r1:c1')).toEqual({ input: { n: 3 } });
  });

  it('refuses a key without a row and a column', () => {
    expect(() => new CellMap().set('r1', {})).toThrow(RangeError);
    expect(new CellMap().delete('r1')).toBe(false);
  });

  it('holds one frozen format for every cell of the same style', () => {
    const map = CellMap.from([
      ['r1:c1', { input: { n: 1 }, format: { b: true, fc: '#fff' } }],
      ['r2:c1', { input: { n: 2 }, format: { fc: '#fff', b: true } }],
    ]);
    const a = map.get('r1:c1')!.format!;
    expect(a).toBe(map.get('r2:c1')!.format);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('holds one string for each id a formula names, and its text once', () => {
    const map = new CellMap();
    map.set('r1:c1', { input: { f: formula('@0*2', 'r9', 'c9') } });
    map.set('r2:c1', { input: { f: { t: '@0', r: [{ s: 'other', r1: 'x', c1: 'y' }] } } });
    map.set('r3:c1', {
      input: { f: { t: '@0', r: [{ r1: 'r1', r2: 'r2', c1: 'c1', c2: 'c1', a: 3 }] } },
    });
    map.set('r4:c1', { input: { f: { t: '@0', r: [{ c1: 'c1' }] } } });
    const odd = { t: '@0', r: [{ r1: 'r1', c1: 'c1', a: 99 }] };
    map.set('r5:c1', { input: { f: odd } });
    expect(map.get('r5:c1')!.input).toEqual({ f: odd });
    expect(map.get('r1:c1')).toEqual({ input: { f: formula('@0*2', 'r9', 'c9') } });
    expect(map.get('r2:c1')!.input).toEqual({
      f: { t: '@0', r: [{ s: 'other', r1: 'x', c1: 'y' }] },
    });
    expect(map.get('r3:c1')!.input).toEqual({
      f: { t: '@0', r: [{ r1: 'r1', r2: 'r2', c1: 'c1', c2: 'c1', a: 3 }] },
    });
    expect(map.get('r4:c1')!.input).toEqual({ f: { t: '@0', r: [{ c1: 'c1' }] } });
  });

  it('keeps the order cells were first written in, as a Map does', () => {
    const map = new CellMap();
    map.set('a:1', { input: { n: 1 } });
    map.set('b:1', { input: { n: 2 } });
    map.set('a:1', { input: { n: 3 } });
    map.delete('b:1');
    map.set('b:1', { input: { n: 4 } });
    expect([...map]).toEqual([
      ['a:1', { input: { n: 3 } }],
      ['b:1', { input: { n: 4 } }],
    ]);
    const seen: string[] = [];
    map.forEach((cell, key, owner) => {
      expect(owner).toBe(map);
      seen.push(`${key}=${(cell.input as { n: number }).n}`);
    });
    expect(seen).toEqual(['a:1=3', 'b:1=4']);
    expect([...map.values()]).toEqual([{ input: { n: 3 } }, { input: { n: 4 } }]);
    expect(map.delete('a:9')).toBe(false);
    map.set('c:2', { input: { n: 5 } });
    expect(map.delete('a:2')).toBe(false);
    expect(map.delete('z:1')).toBe(false);
  });

  it('empties on clear and fills again', () => {
    const map = CellMap.from([['r1:c1', { input: { n: 1 } }]]);
    map.clear();
    expect(map.size).toBe(0);
    expect(map.get('r1:c1')).toBeUndefined();
    map.set('r1:c1', { input: { s: 'x' } });
    expect([...map]).toEqual([['r1:c1', { input: { s: 'x' } }]]);
  });

  it('reads as a Map does through a long random walk of sets and deletes', () => {
    const rand = seeded(7);
    const map = new CellMap();
    const oracle = new Map<string, Cell>();
    for (let step = 0; step < 40_000; step++) {
      const key = `r${Math.floor(rand() * 300)}:c${Math.floor(rand() * 40)}`;
      if (rand() < 0.35) {
        expect(map.delete(key)).toBe(oracle.delete(key));
      } else {
        const cell = randomCell(rand);
        map.set(key, cell);
        oracle.set(key, cell);
      }
    }
    expect(map.size).toBe(oracle.size);
    expect([...map]).toEqual([...oracle]);
  });

  it('keeps a copy and its source apart, page by page', () => {
    const source = new CellMap();
    for (let r = 0; r < 10_000; r++) source.set(`r${r}:c0`, { input: { n: r } });
    source.set('r3:c0', { input: { s: 'three' } });
    const before = [...source];
    const next = source.copy();
    next.set('r5000:c0', { input: { s: 'changed' } });
    next.delete('r1:c0');
    next.set('r10000:c0', { input: { n: -1 } });
    expect(source.get('r5000:c0')).toEqual({ input: { n: 5000 } });
    expect(source.get('r1:c0')).toEqual({ input: { n: 1 } });
    expect(source.has('r10000:c0')).toBe(false);
    expect([...source]).toEqual(before);
    // The source written after the copy leaves the copy as it was.
    source.set('r2:c0', { input: { b: true } });
    expect(next.get('r2:c0')).toEqual({ input: { n: 2 } });
    expect(next.get('r5000:c0')).toEqual({ input: { s: 'changed' } });
    expect(next.size).toBe(10_000);
    expect(source.size).toBe(10_000);
  });

  it('keeps packed formulas whole through rewrites, compaction and copies', () => {
    const map = new CellMap();
    const at = (i: number) => `r${i}:c0`;
    const f = (i: number, round: number): StoredFormula => ({
      t: `@0+${round}`,
      r: [{ r1: `r${i + 1}`, c1: 'c0', r2: `r${i + 2}`, c2: 'c1', a: 5 }],
    });
    for (let i = 0; i < 300; i++) map.set(at(i), { input: { f: f(i, 0) } });
    // Each round writes every formula again, leaving the last one's integers dead in the pool.
    for (let round = 1; round <= 6; round++) {
      for (let i = 0; i < 300; i++) map.set(at(i), { input: { f: f(i, round) } });
    }
    const copy = map.copy();
    for (let i = 0; i < 300; i += 2) copy.set(at(i), { input: { n: i } });
    for (let i = 1; i < 300; i += 2) copy.set(at(i), { input: { f: f(i, 9) } });
    for (let i = 0; i < 300; i++) expect(map.get(at(i))).toEqual({ input: { f: f(i, 6) } });
    expect(copy.get(at(2))).toEqual({ input: { n: 2 } });
    expect(copy.get(at(3))).toEqual({ input: { f: f(3, 9) } });
    map.delete(at(0));
    expect(copy.get(at(1))).toEqual({ input: { f: f(1, 9) } });
  });

  it('compacts the slots of deleted cells, keeping the order', () => {
    const map = new CellMap();
    for (let i = 0; i < 12_000; i++) map.set(`r${i}:c0`, { input: { n: i } });
    for (let i = 0; i < 12_000; i += 3) map.set(`r${i}:c0`, { input: { s: `s${i}` } });
    for (let i = 0; i < 12_000; i++) if (i % 3 !== 0) map.delete(`r${i}:c0`);
    expect(map.size).toBe(4_000);
    expect([...map.keys()].slice(0, 3)).toEqual(['r0:c0', 'r3:c0', 'r6:c0']);
    expect(map.get('r11997:c0')).toEqual({ input: { s: 's11997' } });
    expect(map.get('r11998:c0')).toBeUndefined();
  });
});

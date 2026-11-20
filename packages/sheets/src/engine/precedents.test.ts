// formulas.md "Recalculation": a read settles a formula's single-cell precedents first, each once.
import { describe, expect, it } from 'vitest';
import { CellMap } from '../cells/cell-map';
import type { Sheet, StoredFormula } from '../sheet';
import { book } from '../testing/book';
import { formulaPrecedents } from './precedents';

function sheet(id: string, cells: Record<string, StoredFormula | number>): Sheet {
  const map = new CellMap();
  for (const [key, v] of Object.entries(cells))
    map.set(key, { input: typeof v === 'number' ? { n: v } : { f: v } });
  return {
    id,
    tabId: id,
    title: id,
    layout: { rows: ['r1', 'r2'], cols: ['c1', 'c2'] },
    cells: map,
    rev: 0,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: { id: '', name: '', color: '#000000' },
  };
}

describe('formulaPrecedents', () => {
  it('names the formula cells a formula reads one by one, on its sheet or another by id', () => {
    const f: StoredFormula = { t: '=1', r: [] };
    const own = sheet('own', { 'r1:c1': f, 'r1:c2': 5 });
    const other = sheet('other', { 'r2:c2': f });
    const sheets = new Map([
      ['own', own],
      ['other', other],
    ]);
    const formula: StoredFormula = {
      t: '=@0+@1+@2+@3+@4+@5+@6+@7',
      r: [
        { r1: 'r1', c1: 'c1' },
        { r1: 'r1', c1: 'c2' },
        { s: 'other', r1: 'r2', c1: 'c2' },
        { r1: 'r1', c1: 'c1', r2: 'r2', c2: 'c2' },
        { r1: 'r1', c1: 'c1', spill: true },
        { st: 'Gone', p: [0, 0, -1, -1] },
        { c1: 'c1', c2: 'c1' },
        { s: 'missing', r1: 'r1', c1: 'c1' },
      ],
    };
    expect(formulaPrecedents(formula, 'own', (id) => sheets.get(id))).toEqual([
      'own|r1:c1',
      'other|r2:c2',
    ]);
  });
});

describe('a long chain', () => {
  it('is worked out once a link, through another sheet too, and a loop still names itself', () => {
    const one: Record<string, string> = { A1: '1' };
    for (let r = 2; r <= 600; r++) one[`A${r}`] = r === 300 ? '=Two!A1+1' : `=A${r - 1}+1`;
    const b = book(
      { One: one, Two: { A1: '=One!A299+1', B1: '=B2', B2: '=B1' } },
      { rows: 600, cols: 3 },
    );
    expect(b.v('A600', 'One')).toBe(601);
    expect(b.v('B1', 'Two')).toMatchObject({ e: '#REF!' });
  });
});

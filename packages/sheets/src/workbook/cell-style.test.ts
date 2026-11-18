import { describe, expect, it } from 'vitest';
import { CellStyle, StyleTable } from './cell-style';

// docs/specs/029-sheets/sheet-store.md "In a spreadsheet": each distinct style once, by id; a cell holds a style id.
describe('CellStyle', () => {
  it('keys a format by its meaning, whatever the order its keys came in', () => {
    expect(CellStyle.keyOf({ i: true, b: true, fc: '#ff0000' })).toBe(
      CellStyle.keyOf({ fc: '#ff0000', b: true, i: true }),
    );
  });

  it('reads a stored style, and refuses one that is not a format', () => {
    expect(CellStyle.read({ b: true, nf: 'percent' })).toEqual({ b: true, nf: 'percent' });
    expect(CellStyle.read({ b: 'yes' })).toBeNull();
    expect(CellStyle.read({ zz: 1 })).toBeNull();
    expect(CellStyle.read('b')).toBeNull();
  });
});

describe('StyleTable', () => {
  it('gives each distinct style one id, and the same id again for the same style', () => {
    const a = StyleTable.intern(StyleTable.empty(), { b: true });
    const b = StyleTable.intern(a.table, { i: true });
    const c = StyleTable.intern(b.table, { b: true });
    expect(a.id).toBe('s1');
    expect(b.id).toBe('s2');
    expect(c.id).toBe('s1');
    expect(c.table).toBe(b.table);
    expect(StyleTable.of(c.table, 's2')).toEqual({ i: true });
  });

  it('gives no style an id: an unformatted cell holds none', () => {
    const { table, id } = StyleTable.intern(StyleTable.empty(), {});
    expect(id).toBeNull();
    expect(StyleTable.size(table)).toBe(0);
  });

  it('interns many at once, in order', () => {
    const { table, ids } = StyleTable.internAll(StyleTable.empty(), [
      { b: true },
      undefined,
      { b: true },
      { u: true },
    ]);
    expect(ids).toEqual(['s1', null, 's1', 's2']);
    expect(StyleTable.size(table)).toBe(2);
  });

  it('is made from stored rows, carrying on after the highest id', () => {
    const table = StyleTable.fromRows([
      { id: 's4', keys: '{"b":true}' },
      { id: 's9', keys: '{"i":true}' },
    ]);
    expect(StyleTable.idOf(table, { i: true })).toBe('s9');
    expect(StyleTable.intern(table, { u: true }).id).toBe('s10');
  });

  it('leaves out a stored row that is not a style', () => {
    const table = StyleTable.fromRows([
      { id: 's1', keys: 'not json' },
      { id: 'x', keys: '{"b":true}' },
    ]);
    expect(StyleTable.size(table)).toBe(0);
  });
});

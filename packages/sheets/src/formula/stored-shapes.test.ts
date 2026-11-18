// docs/specs/029-sheets/performance.md "Held in memory": formulas of one shape are parsed once.
import { describe, expect, it, vi } from 'vitest';
import { storedAst } from './stored';

vi.mock('../limits', async (original) => ({
  ...(await original<typeof import('../limits')>()),
  AST_SHAPES_MAX: 2,
}));

describe('storedAst', () => {
  it('shares one tree among formulas of one shape, whatever cells they name', () => {
    const a = storedAst({ t: '@0*2', r: [{ r1: 'r1', c1: 'c1' }] });
    const b = storedAst({ t: '@0*2', r: [{ r1: 'r2', c1: 'c1' }] });
    expect(a).not.toBeNull();
    expect(b).toBe(a);
  });

  it('keeps the newest shapes past its cap, and parses an old one again', () => {
    const first = storedAst({ t: '@0+1', r: [{ r1: 'r1', c1: 'c1' }] });
    storedAst({ t: '@0+2', r: [{ r1: 'r1', c1: 'c1' }] });
    storedAst({ t: '@0+3', r: [{ r1: 'r1', c1: 'c1' }] });
    const again = storedAst({ t: '@0+1', r: [{ r1: 'r1', c1: 'c1' }] });
    expect(again).toEqual(first);
    expect(again).not.toBe(first);
  });

  it('holds a template that cannot be read as null', () => {
    expect(storedAst({ t: '(', r: [] })).toBeNull();
  });
});

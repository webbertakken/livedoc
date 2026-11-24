import { describe, expect, it, vi } from 'vitest';
import { mergeBindings, type MergePort } from './merge-bindings';

const port = (over: Partial<MergePort> = {}): MergePort => ({
  range: { r1: 0, c1: 0, r2: 2, c2: 1 },
  merged: false,
  merge: vi.fn(),
  unmerge: vi.fn(),
  ...over,
});

// docs/specs/029-sheets/formatting.md "Merges" (D208).
describe('mergeBindings', () => {
  it('runs each merge by its mode and Unmerge', () => {
    const p = port({ merged: true });
    const b = mergeBindings(p);
    b['merge-all']!.run();
    b['merge-vertically']!.run();
    b['merge-horizontally']!.run();
    b.unmerge!.run();
    expect(vi.mocked(p.merge).mock.calls).toEqual([['all'], ['down'], ['across']]);
    expect(p.unmerge).toHaveBeenCalledOnce();
  });

  it('dims Merge All for a cell, Vertically for a row, Horizontally for a column, Unmerge with no merge', () => {
    const cell = mergeBindings(port({ range: { r1: 0, c1: 0, r2: 0, c2: 0 } }));
    expect(
      ['merge-all', 'merge-vertically', 'merge-horizontally', 'unmerge'].map(
        (id) => cell[id]!.disabled,
      ),
    ).toEqual([true, true, true, true]);
    const row = mergeBindings(port({ range: { r1: 0, c1: 0, r2: 0, c2: 3 } }));
    expect([row['merge-vertically']!.disabled, row['merge-horizontally']!.disabled]).toEqual([
      true,
      false,
    ]);
    const column = mergeBindings(port({ range: { r1: 0, c1: 0, r2: 3, c2: 0 } }));
    expect([column['merge-vertically']!.disabled, column['merge-horizontally']!.disabled]).toEqual([
      false,
      true,
    ]);
  });

  it('makes the toolbar’s button merge all, or unmerge a selection holding a merge, pressed while it does', () => {
    const plain = port();
    const button = mergeBindings(plain)['merge-cells']!;
    expect([button.checked, button.disabled]).toEqual([false, false]);
    button.run();
    expect(plain.merge).toHaveBeenCalledWith('all');
    const held = port({ merged: true, range: { r1: 0, c1: 0, r2: 0, c2: 0 } });
    const pressed = mergeBindings(held)['merge-cells']!;
    expect([pressed.checked, pressed.disabled]).toEqual([true, false]);
    pressed.run();
    expect(held.unmerge).toHaveBeenCalledOnce();
    expect(
      mergeBindings(port({ range: { r1: 0, c1: 0, r2: 0, c2: 0 } }))['merge-cells']!.disabled,
    ).toBe(true);
  });
});

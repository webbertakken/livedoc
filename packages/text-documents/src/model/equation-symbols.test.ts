// docs/specs/034-text-documents/objects.md "Equations in the editor": the toolbar's menus and the typed shortcuts,
// each symbol by its name, structures with empty rows, function names as one upright word.
import { describe, expect, it } from 'vitest';
import {
  EQUATION_FUNCTIONS,
  EQUATION_MENU_LABELS,
  EQUATION_MENUS,
  EQUATION_STRUCTURE_MENU,
  EQUATION_SYMBOLS,
  equationShortcut,
} from './equation-symbols';
import { Equations } from './equations';

describe('the equation menus', () => {
  it('are Google’s five, in its order', () => {
    expect(EQUATION_MENUS.map((m) => EQUATION_MENU_LABELS[m])).toEqual([
      'Greek letters',
      'Miscellaneous operations',
      'Relations',
      'Math operators',
      'Arrows',
    ]);
  });

  it('name each symbol and structure once', () => {
    const names = [
      ...Object.values(EQUATION_SYMBOLS).flatMap((group) => group.map((s) => s.name)),
      ...EQUATION_STRUCTURE_MENU.map((s) => s.name),
      ...EQUATION_FUNCTIONS,
    ];
    expect(new Set(names).size).toBe(names.length);
    for (const group of Object.values(EQUATION_SYMBOLS))
      for (const s of group) expect([...s.symbol]).toHaveLength(1);
  });

  it('build every structure with its rows empty and valid', () => {
    for (const s of EQUATION_STRUCTURE_MENU)
      expect(Equations.of([s.build()]), s.name).toBeDefined();
  });
});

describe('a typed shortcut', () => {
  it.each([
    ['alpha', { kind: 'identifier', text: 'α' }],
    ['leq', { kind: 'operator', text: '≤' }],
    ['rightarrow', { kind: 'operator', text: '→' }],
    ['ne', { kind: 'operator', text: '≠' }],
    ['sin', { kind: 'identifier', text: 'sin' }],
    ['frac', { kind: 'fraction', numerator: [], denominator: [] }],
    ['int', { kind: 'large-operator', operator: '∫', lower: [], upper: [], body: [] }],
    ['lim', { kind: 'under-over', base: [{ kind: 'identifier', text: 'lim' }], under: [] }],
  ])('writes \\%s', (name, node) => {
    expect(equationShortcut(name)).toEqual(node);
  });

  it('stands for nothing when its name is unknown', () => {
    expect(equationShortcut('alphabet')).toBeUndefined();
  });
});

describe('a typed character', () => {
  it.each([
    ['7', 'number'],
    ['x', 'identifier'],
    ['Ω', 'identifier'],
    ['+', 'operator'],
    ['(', 'operator'],
  ])('reads %s as a token of its kind', (char, kind) => {
    expect(Equations.token(char)).toEqual({ kind, text: char });
  });
});

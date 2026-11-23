// docs/specs/034-text-documents/objects.md "Equations in the editor": typing, typed shortcuts, moving and removing in
// an equation's box, each from one equation and caret to the next.
import { describe, expect, it } from 'vitest';
import { EquationEditing, type MathCaret, type MathEdit } from './equation-editing';
import type { MathNode, MathRow } from './equations';

const id = (text: string): MathNode => ({ kind: 'identifier', text });
const num = (text: string): MathNode => ({ kind: 'number', text });
const op = (text: string): MathNode => ({ kind: 'operator', text });
const at = (offset: number, ...path: [number, number][]): MathCaret => ({
  path: path.map(([node, row]) => ({ node, row })),
  offset,
});
const typed = (text: string, from: MathEdit = { math: [], caret: at(0) }): MathEdit =>
  [...text].reduce(EquationEditing.type, from);
const FRACTION: MathRow = [{ kind: 'fraction', numerator: [id('a')], denominator: [id('b')] }];

describe('typing in an equation', () => {
  it('writes each character as a token of its own, a space as nothing', () => {
    expect(typed('x+12 ')).toEqual({ math: [id('x'), op('+'), num('1'), num('2')], caret: at(4) });
  });

  it('writes a known shortcut on the space after it, the caret in its first empty row', () => {
    expect(typed('a\\frac ')).toEqual({
      math: [id('a'), { kind: 'fraction', numerator: [], denominator: [] }],
      caret: at(0, [1, 0]),
    });
    expect(typed('\\alpha ').math).toEqual([id('α')]);
    expect(typed('\\sin x').math).toEqual([id('sin'), id('x')]);
  });

  it('leaves a name it does not know as typed', () => {
    expect(typed('\\nope ').math).toEqual([op('\\'), id('n'), id('o'), id('p'), id('e')]);
  });

  it('makes the node before the caret a superscript’s base, the caret in the superscript', () => {
    expect(typed('x^2')).toEqual({
      math: [{ kind: 'scripts', base: [id('x')], sup: [num('2')] }],
      caret: at(1, [0, 1]),
    });
  });

  it('takes a backslash before ^ or _ with it, as Google’s help types them', () => {
    expect(typed('y\\_i').math).toEqual([{ kind: 'scripts', base: [id('y')], sub: [id('i')] }]);
  });

  it('adds the other script to a node that has one', () => {
    const sub = typed('x_1');
    const after = EquationEditing.right(sub.math, sub.caret) as MathCaret;
    expect(typed('^2', { math: sub.math, caret: after }).math).toEqual([
      { kind: 'scripts', base: [id('x')], sub: [num('1')], sup: [num('2')] },
    ]);
  });

  it('gives a script typed with nothing before it an empty base', () => {
    expect(typed('^').math).toEqual([{ kind: 'scripts', base: [], sup: [] }]);
  });

  it('writes a structure from the toolbar, the caret in its first empty row', () => {
    const edit = EquationEditing.insert(
      { math: [id('x')], caret: at(1) },
      { kind: 'root', index: [], radicand: [] },
    );
    expect(edit.caret).toEqual(at(0, [1, 0]));
  });
});

describe('moving in an equation', () => {
  it('steps right over tokens, through a structure’s rows and out, then past the end', () => {
    const math: MathRow = [id('x'), ...FRACTION];
    const walk: (MathCaret | 'after')[] = [];
    let caret: MathCaret | 'after' = at(0);
    while (caret !== 'after') {
      caret = EquationEditing.right(math, caret);
      walk.push(caret);
    }
    expect(walk).toEqual([
      at(1),
      at(0, [1, 0]),
      at(1, [1, 0]),
      at(0, [1, 1]),
      at(1, [1, 1]),
      at(2),
      'after',
    ]);
  });

  it('steps left the same way back, then past the start', () => {
    const walk: (MathCaret | 'before')[] = [];
    let caret: MathCaret | 'before' = at(1);
    while (caret !== 'before') {
      caret = EquationEditing.left(FRACTION, caret);
      walk.push(caret);
    }
    expect(walk).toEqual([
      at(1, [0, 1]),
      at(0, [0, 1]),
      at(1, [0, 0]),
      at(0, [0, 0]),
      at(0),
      'before',
    ]);
  });

  it('moves up and down between a fraction’s numerator and denominator, to the row’s end', () => {
    expect(EquationEditing.vertical(FRACTION, at(0, [0, 0]), 'down')).toEqual(at(1, [0, 1]));
    expect(EquationEditing.vertical(FRACTION, at(0, [0, 1]), 'up')).toEqual(at(1, [0, 0]));
    expect(EquationEditing.vertical(FRACTION, at(0, [0, 1]), 'down')).toEqual(at(0, [0, 1]));
    expect(EquationEditing.vertical(FRACTION, at(1), 'up')).toEqual(at(1));
  });

  it('moves from a script’s base up to its superscript and down to its subscript', () => {
    const math: MathRow = [{ kind: 'scripts', base: [id('x')], sub: [num('1')], sup: [num('2')] }];
    expect(EquationEditing.vertical(math, at(1, [0, 0]), 'up')).toEqual(at(1, [0, 2]));
    expect(EquationEditing.vertical(math, at(1, [0, 0]), 'down')).toEqual(at(1, [0, 1]));
  });

  it('keeps a caret where it can stand once the equation changed under it', () => {
    expect(EquationEditing.within(FRACTION, at(1, [0, 0]))).toEqual(at(1, [0, 0]));
    expect(EquationEditing.within(FRACTION, at(2, [0, 0]))).toEqual(at(1));
    expect(EquationEditing.within([], at(0, [0, 0]))).toEqual(at(0));
  });
});

describe('removing in an equation', () => {
  it('removes the token before the caret', () => {
    expect(EquationEditing.backspace({ math: [id('x'), id('y')], caret: at(2) })).toEqual({
      math: [id('x')],
      caret: at(1),
    });
  });

  it('steps into the structure before the caret, to its last row’s end', () => {
    expect(EquationEditing.backspace({ math: FRACTION, caret: at(1) })).toEqual({
      math: FRACTION,
      caret: at(1, [0, 1]),
    });
  });

  it('undoes a structure at a row’s start, its rows’ content in its place', () => {
    expect(
      EquationEditing.backspace({ math: [id('x'), ...FRACTION], caret: at(0, [1, 1]) }),
    ).toEqual({
      math: [id('x'), id('a'), id('b')],
      caret: at(2),
    });
    expect(EquationEditing.delete({ math: FRACTION, caret: at(1, [0, 0]) })).toEqual({
      math: [id('a'), id('b')],
      caret: at(1),
    });
  });

  it('removes an empty equation, and does nothing at a full one’s start', () => {
    expect(EquationEditing.backspace({ math: [], caret: at(0) })).toBe('remove');
    expect(EquationEditing.delete({ math: [], caret: at(0) })).toBe('remove');
    expect(EquationEditing.backspace({ math: FRACTION, caret: at(0) })).toBeUndefined();
    expect(EquationEditing.delete({ math: FRACTION, caret: at(1) })).toBeUndefined();
  });

  it('deletes the token after the caret, and steps into the structure after it', () => {
    expect(EquationEditing.delete({ math: [id('x'), id('y')], caret: at(0) })).toEqual({
      math: [id('y')],
      caret: at(0),
    });
    expect(EquationEditing.delete({ math: FRACTION, caret: at(0) })).toEqual({
      math: FRACTION,
      caret: at(0, [0, 0]),
    });
  });
});

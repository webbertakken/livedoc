// docs/specs/034-text-documents/objects.md "Equations in the editor": marked for the editor, every row of an equation is
// its own `mrow` naming its place, an empty one saying so, so the caret can stand in it; a file's MathML is unmarked.
import { describe, expect, it } from 'vitest';
import { mathMlTree, mathMlXml, type MathMlElement } from './equation-mathml';
import type { MathRow } from './equations';

const rows = (e: MathMlElement): string[] => [
  ...(e.attrs['data-row'] === undefined
    ? []
    : [`${e.attrs['data-row']}${e.attrs['data-empty'] ? '∅' : ''}`]),
  ...e.children.flatMap((c) => (typeof c === 'string' ? [] : rows(c))),
];

describe('an equation marked for the editor', () => {
  it('names every row by its place, its empty rows too', () => {
    const math: MathRow = [
      { kind: 'identifier', text: 'x' },
      { kind: 'fraction', numerator: [{ kind: 'root', radicand: [] }], denominator: [] },
    ];
    expect(rows(mathMlTree(math, true))).toEqual(['', '1.0', '1.0/0.0∅', '1.1∅']);
  });

  it('draws both limits of a large operator and a fence’s body in rows of their own', () => {
    const math: MathRow = [
      { kind: 'large-operator', operator: '∑', lower: [], upper: [], body: [] },
      { kind: 'fence', open: '(', close: ')', body: [{ kind: 'number', text: '1' }] },
    ];
    expect(rows(mathMlTree(math, true))).toEqual(['', '0.0∅', '0.1∅', '0.2∅', '1.0']);
  });

  it('is never marked in a file', () => {
    expect(mathMlXml([{ kind: 'root', radicand: [] }])).not.toContain('data-');
  });
});

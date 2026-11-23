// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Equations in the editor": a press on the equation toolbar writes its symbol
// or structure at the caret in the equation being written, else a new equation holding it, counted as Insert > Equation.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { MathNode } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { equationBoxOf, equationBoxPlugin } from './text-document-equation-box';
import { newEquationFromToolbar, writeFromEquationToolbar } from './text-document-equation-toolbar';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));

const ALPHA: MathNode = { kind: 'identifier', text: 'α' };
const FRACTION: MathNode = { kind: 'fraction', numerator: [], denominator: [] };

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
  track.mockClear();
});

function mount(): EditorView {
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, schema.text('ab'))]);
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
      plugins: [equationBoxPlugin()],
    }),
  });
  return view;
}

describe('the equation toolbar', () => {
  it('puts a new equation holding the symbol in at the caret, counted, the caret after it', () => {
    const v = mount();
    expect(writeFromEquationToolbar(v, ALPHA)).toBe(true);
    expect(v.state.doc.nodeAt(2)?.attrs.math).toEqual([ALPHA]);
    expect(equationBoxOf(v.state)).toEqual({ pos: 2, caret: { path: [], offset: 1 } });
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentEquation');
  });

  it('writes into the equation being written, a structure with the caret in its first empty row', () => {
    const v = mount();
    writeFromEquationToolbar(v, ALPHA);
    track.mockClear();
    writeFromEquationToolbar(v, FRACTION);
    expect(v.state.doc.nodeAt(2)?.attrs.math).toEqual([ALPHA, FRACTION]);
    expect(equationBoxOf(v.state)?.caret).toEqual({ path: [{ node: 1, row: 0 }], offset: 0 });
    expect(track).not.toHaveBeenCalled();
  });

  it('puts in an empty equation from New equation, counted', () => {
    const v = mount();
    expect(newEquationFromToolbar(v)).toBe(true);
    expect(v.state.doc.nodeAt(2)?.attrs.math).toEqual([]);
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentEquation');
  });
});
